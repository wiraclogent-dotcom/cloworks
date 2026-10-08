import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole, JobRole } from "@prisma/client";
import { seed } from "../prisma/seedCore";
import { createRequestWith } from "@/lib/createRequest";
import { assignRequestWith } from "@/lib/collab";
import { transitionRequestWith, TransitionError } from "@/lib/transition";
import { notifyWith, type Mailer, type Notifier } from "@/lib/notify";
import { setTargetWith } from "@/lib/kpi/targets";
import { loadKpiRequests, loadTargets } from "@/lib/kpi/queries";
import { computeKpi } from "@/lib/kpi/metrics";
import { createTestDb, type TestDb } from "./helpers/testDb";

// Lifecycle through the real cores with the real seed. NOW is fixed inside October 2026 (Jakarta) and precedes the real clock
// the cores read for transition events, so StatusEvent ordering by `at` is deterministic.
const NOW = new Date("2026-10-05T03:00:00Z");
const MONTH = "2026-10";
const FOLDER = "https://drive.google.com/drive/folders/abc123";

describe("request lifecycle (seeded roster, real cores, embedded Postgres)", () => {
  let db: TestDb;
  const u: Record<string, { id: string; appRole: AppRole; jobRole: JobRole }> = {};
  const sent: { to: string; subject: string }[] = [];
  let notifier: Notifier;
  let reqId: string;

  const fakeMailer: Mailer = { async send(m) { sent.push({ to: m.to, subject: m.subject }); } };
  const state = () => db.prisma.request.findUniqueOrThrow({ where: { id: reqId } });
  const move = (who: string, to: Parameters<typeof transitionRequestWith>[3], opts = {}) =>
    transitionRequestWith(db.prisma, u[who], reqId, to, opts, notifier);
  async function kpi(who: string, role: JobRole) {
    const reqs = await loadKpiRequests(db.prisma, [MONTH]);
    const t = (await loadTargets(db.prisma, [MONTH], u[who].id))[0] ?? null;
    expect(t?.role).toBe(role);
    return computeKpi(reqs, u[who], MONTH, t);
  }

  beforeAll(async () => {
    db = await createTestDb();
    await seed(db.prisma);
    for (const name of ["Fafa", "Idzni", "Fadli", "Wira", "Irsyad"]) {
      const r = await db.prisma.user.findFirstOrThrow({ where: { name } });
      u[name] = { id: r.id, appRole: r.appRole, jobRole: r.jobRole };
    }
    notifier = (input) => notifyWith(db.prisma, fakeMailer, input, { baseUrl: undefined });
  });
  afterAll(async () => { await db?.stop(); });

  it("requester submits a Social Media request", async () => {
    const [brand, division, type] = await Promise.all([
      db.prisma.brand.findFirstOrThrow({ where: { name: "Clogent" } }),
      db.prisma.division.findFirstOrThrow({ where: { name: "Social Media" } }),
      db.prisma.requestType.findFirstOrThrow({ where: { name: "Social Media" } }),
    ]);
    const r = await createRequestWith(
      db.prisma,
      u.Fafa,
      { title: "October TikTok campaign", brandId: brand.id, divisionId: division.id, typeId: type.id, deadline: "2026-10-20", fields: { platform: "TikTok", contentType: "Campaign" } },
      NOW,
    );
    reqId = r.id;
    const row = await state();
    expect(row).toMatchObject({ status: "REQUESTED", requesterId: u.Fafa.id, assigneeId: null, outputCount: 1, includeKpi: true });
    expect(row.fields).toEqual({ platform: "TikTok", contentType: "Campaign" });
  });

  it("denies actions outside the role, and unassigned DONE", async () => {
    await expect(move("Fafa", "ON_PROGRESS")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(move("Fafa", "ON_PROGRESS")).rejects.toBeInstanceOf(TransitionError);
    expect(await assignRequestWith(db.prisma, u.Fafa, reqId, u.Fadli.id, notifier)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await assignRequestWith(db.prisma, u.Fadli, reqId, u.Fadli.id, notifier)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const t = { userId: u.Fadli.id, month: MONTH, role: "DESIGNER" as const, targetTasks: 10 };
    expect(await setTargetWith(db.prisma, u.Fadli, t)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await setTargetWith(db.prisma, u.Fafa, t)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect((await state()).status).toBe("REQUESTED");
    expect(await db.prisma.kpiTarget.count()).toBe(0);
  });

  it("refuses DONE on an unassigned request (separate request, same flow)", async () => {
    const main = await state();
    const other = await createRequestWith(
      db.prisma,
      u.Fafa,
      { title: "Unassigned one", brandId: main.brandId, divisionId: main.divisionId, typeId: main.typeId, deadline: null, fields: { platform: "Instagram", contentType: "Daily" } },
      NOW,
    );
    const go = (to: Parameters<typeof transitionRequestWith>[3]) => transitionRequestWith(db.prisma, u.Fadli, other.id, to, {}, notifier);
    await go("ON_PROGRESS");
    await go("FIRST_LOOK");
    await expect(go("DONE")).rejects.toMatchObject({ code: "INVALID" });
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("FIRST_LOOK");
  });

  it("lead assigns Fadli; Fadli finishes with 2 outputs and a folder", async () => {
    expect(await assignRequestWith(db.prisma, u.Idzni, reqId, u.Fadli.id, notifier)).toEqual({ ok: true });
    expect((await state()).assigneeId).toBe(u.Fadli.id);

    // REQUESTED -> ON_PROGRESS -> FIRST_LOOK, one revision loop (FIRST_LOOK -> ON_PROGRESS -> FIRST_LOOK), then DONE
    await move("Fadli", "ON_PROGRESS");
    await move("Fadli", "FIRST_LOOK");
    await move("Fadli", "ON_PROGRESS");
    await move("Fadli", "FIRST_LOOK");
    await move("Fadli", "DONE", { outputCount: 2, designFolderUrl: FOLDER });
    expect(await state()).toMatchObject({ status: "DONE", outputCount: 2, designFolderUrl: FOLDER, assigneeId: u.Fadli.id });
  });

  it("records the full StatusEvent chain with actors", async () => {
    const ev = await db.prisma.statusEvent.findMany({ where: { requestId: reqId }, orderBy: { at: "asc" } });
    expect(ev.map((e) => [e.from, e.to, e.actorId])).toEqual([
      [null, "REQUESTED", u.Fafa.id],
      ["REQUESTED", "ON_PROGRESS", u.Fadli.id],
      ["ON_PROGRESS", "FIRST_LOOK", u.Fadli.id],
      ["FIRST_LOOK", "ON_PROGRESS", u.Fadli.id],
      ["ON_PROGRESS", "FIRST_LOOK", u.Fadli.id],
      ["FIRST_LOOK", "DONE", u.Fadli.id],
    ]);
  });

  it("writes notifications: assigned -> Fadli, status changes -> Fafa (never the actor)", async () => {
    const n = await db.prisma.notification.findMany({ where: { requestId: reqId }, orderBy: { createdAt: "asc" } });
    const toFadli = n.filter((x) => x.userId === u.Fadli.id);
    const toFafa = n.filter((x) => x.userId === u.Fafa.id);
    expect(toFadli.map((x) => x.type)).toEqual(["ASSIGNED"]);
    expect(toFadli[0].message).toBe("Idzni assigned you to “October TikTok campaign”");
    // Fadli made 5 transitions; the requester is told about each (the assignee is the actor, so is skipped).
    expect(toFafa.map((x) => x.type)).toEqual(["STATUS", "STATUS", "STATUS", "STATUS", "STATUS"]);
    expect(toFafa[0].message).toBe("Fadli moved “October TikTok campaign” from Requested to On progress");
    expect(toFafa.at(-1)!.message).toMatch(/to Done$/);
    expect(n).toHaveLength(6);
    expect(sent).toEqual([]); // seeded roster has no email addresses, so only in-app rows
  });

  it("KPI: Fadli (designer) and Fafa (social media requester) both count the task", async () => {
    expect(await setTargetWith(db.prisma, u.Idzni, { userId: u.Fadli.id, month: MONTH, role: "DESIGNER", targetTasks: 4 })).toEqual({ ok: true });
    expect(await setTargetWith(db.prisma, u.Wira, { userId: u.Fafa.id, month: MONTH, role: "SOCIAL_MEDIA", targetTasks: 2 })).toEqual({ ok: true });

    const fadli = await kpi("Fadli", "DESIGNER");
    expect(fadli).toMatchObject({ tasksDone: 1, target: 4, progress: 0.25, totalOutputs: 2, revisionRounds: 1, activeWorkload: 0 });
    const fafa = await kpi("Fafa", "SOCIAL_MEDIA");
    expect(fafa).toMatchObject({ tasksDone: 1, target: 2, progress: 0.5, totalOutputs: 2, activeWorkload: 0 });
    // Someone else with the same month sees nothing.
    const reqs = await loadKpiRequests(db.prisma, [MONTH]);
    expect(computeKpi(reqs, u.Irsyad, MONTH, { role: "DESIGNER", targetTasks: 4 })).toMatchObject({ tasksDone: 0, totalOutputs: 0 });
  });

  it("reopening DONE removes it from tasksDone until DONE again", async () => {
    await move("Fadli", "ON_PROGRESS");
    let fadli = await kpi("Fadli", "DESIGNER");
    expect(fadli).toMatchObject({ tasksDone: 0, progress: 0, totalOutputs: 0, activeWorkload: 1 });
    expect((await kpi("Fafa", "SOCIAL_MEDIA")).tasksDone).toBe(0);

    await move("Fadli", "FIRST_LOOK");
    await move("Fadli", "DONE", { outputCount: 2 });
    fadli = await kpi("Fadli", "DESIGNER");
    expect(fadli).toMatchObject({ tasksDone: 1, progress: 0.25, totalOutputs: 2, revisionRounds: 1, activeWorkload: 0 }); // reopen is DONE -> ON_PROGRESS, not a FIRST_LOOK revision
  });
});
