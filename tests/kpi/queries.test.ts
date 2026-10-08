import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { JobRole, RequestStatus as S } from "@prisma/client";
import { loadKpiRequests, loadTargets } from "@/lib/kpi/queries";
import { computeKpi } from "@/lib/kpi/metrics";
import { setTargetWith } from "@/lib/kpi/targets";
import { createTestDb, type TestDb } from "../helpers/testDb";

describe("kpi queries + targets", () => {
  let db: TestDb;
  const ids: Record<string, string> = {};
  let base: { brandId: string; divisionId: string; typeId: string };

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const mk = async (k: string, appRole: "REQUESTER" | "CREATIVE" | "LEAD" | "ADMIN", jobRole: JobRole) => {
      ids[k] = (await p.user.create({ data: { email: `${k}@clogent.co.id`, name: k, fullName: k, appRole, jobRole } })).id;
    };
    await mk("fadli", "CREATIVE", "DESIGNER");
    await mk("sm", "REQUESTER", "SOCIAL_MEDIA");
    await mk("lead", "LEAD", "OTHER");
    await mk("admin", "ADMIN", "OTHER");
    await mk("creative", "CREATIVE", "DESIGNER");
    await mk("req", "REQUESTER", "OTHER");
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    base = { brandId: brand.id, divisionId: div.id, typeId: type.id };
  });
  afterAll(async () => { await db?.stop(); });

  const mkReq = async (o: { requestedAt: string; status?: S; assignee?: string; requester?: string; includeKpi?: boolean; outputCount?: number; doneAt?: string; deadline?: string }) => {
    const r = await db.prisma.request.create({
      data: {
        title: "t", ...base, requesterId: ids[o.requester ?? "req"], assigneeId: o.assignee ? ids[o.assignee] : null,
        requestedAt: new Date(o.requestedAt), status: o.status ?? S.DONE, includeKpi: o.includeKpi ?? true,
        outputCount: o.outputCount ?? 1, deadline: o.deadline ? new Date(o.deadline) : null,
      },
    });
    if (o.doneAt) await db.prisma.statusEvent.create({ data: { requestId: r.id, from: S.FIRST_LOOK, to: S.DONE, actorId: ids.fadli, at: new Date(o.doneAt) } });
    return r.id;
  };

  describe("loadKpiRequests", () => {
    it("uses Jakarta month boundaries, open requests of any month, and events", async () => {
      const boundary = await mkReq({ requestedAt: "2026-09-30T23:00:00Z", assignee: "creative", doneAt: "2026-10-02T03:00:00Z" });
      const septLate = await mkReq({ requestedAt: "2026-09-30T16:59:00Z", assignee: "creative", doneAt: "2026-10-02T03:00:00Z" });
      const oldOpen = await mkReq({ requestedAt: "2026-03-10T03:00:00Z", assignee: "creative", status: S.ON_PROGRESS });
      const oldDone = await mkReq({ requestedAt: "2026-03-11T03:00:00Z", assignee: "creative" });
      const novStart = await mkReq({ requestedAt: "2026-10-31T17:00:00Z", assignee: "creative" });

      const oct = await loadKpiRequests(db.prisma, ["2026-10"]);
      const octIds = oct.map((r) => r.id);
      expect(octIds).toContain(boundary);
      expect(octIds).not.toContain(septLate);
      expect(octIds).toContain(oldOpen);
      expect(octIds).not.toContain(oldDone);
      expect(octIds).not.toContain(novStart);
      expect(oct.find((r) => r.id === boundary)!.events).toHaveLength(1);
      expect(oct.find((r) => r.id === boundary)!.events[0].to).toBe(S.DONE);

      const sep = await loadKpiRequests(db.prisma, ["2026-09"]);
      expect(sep.map((r) => r.id)).toContain(septLate);
      expect(sep.map((r) => r.id)).not.toContain(boundary);

      const both = await loadKpiRequests(db.prisma, ["2026-09", "2026-10"]);
      expect(both.map((r) => r.id)).toEqual(expect.arrayContaining([boundary, septLate]));
      expect(await loadKpiRequests(db.prisma, [])).toEqual(expect.any(Array));
    });
  });

  describe("end-to-end through computeKpi (sheet-like case)", () => {
    it("designer Fadli, target 50, Oct 2026", async () => {
      const done1 = { assignee: "fadli", requestedAt: "2026-10-05T03:00:00Z", doneAt: "2026-10-06T03:00:00Z", deadline: "2026-10-06T00:00:00Z", outputCount: 3 };
      await mkReq(done1);
      await mkReq({ ...done1, outputCount: 2, doneAt: "2026-10-09T03:00:00Z" }); // late
      await mkReq({ assignee: "fadli", requestedAt: "2026-10-07T03:00:00Z", doneAt: "2026-10-08T03:00:00Z" });
      await mkReq({ assignee: "fadli", requestedAt: "2026-10-07T03:00:00Z", status: S.CANCELLED });
      await mkReq({ assignee: "fadli", requestedAt: "2026-10-07T03:00:00Z", doneAt: "2026-10-08T03:00:00Z", includeKpi: false });
      await mkReq({ assignee: "fadli", requestedAt: "2026-10-08T03:00:00Z", status: S.FIRST_LOOK });
      await mkReq({ assignee: "fadli", requestedAt: "2026-02-08T03:00:00Z", status: S.REQUESTED });
      await mkReq({ assignee: "fadli", requestedAt: "2026-09-08T03:00:00Z" }); // done in Sept: not counted

      const r = await setTargetWith(db.prisma, { id: ids.lead, appRole: "LEAD" }, { userId: ids.fadli, month: "2026-10", role: "DESIGNER", targetTasks: 50 });
      expect(r).toEqual({ ok: true });
      const targets = await loadTargets(db.prisma, ["2026-10"]);
      const t = targets.find((x) => x.userId === ids.fadli && x.month === "2026-10")!;
      const reqs = await loadKpiRequests(db.prisma, ["2026-10"]);
      const k = computeKpi(reqs, { id: ids.fadli, jobRole: "DESIGNER" }, "2026-10", { role: t.role, targetTasks: t.targetTasks });
      expect(k.tasksDone).toBe(3);
      expect(k.target).toBe(50);
      expect(k.progress).toBeCloseTo(0.06);
      expect(k.totalOutputs).toBe(3 + 2 + 1);
      expect(k.onTimeRate).toBeCloseTo(1 / 2);
      expect(k.activeWorkload).toBe(2);
    });

    it("social media user counted as requester per target role", async () => {
      await mkReq({ requester: "sm", assignee: "fadli", requestedAt: "2026-10-12T03:00:00Z", doneAt: "2026-10-13T03:00:00Z" });
      await mkReq({ requester: "sm", requestedAt: "2026-10-12T03:00:00Z", doneAt: "2026-10-13T03:00:00Z" });
      await setTargetWith(db.prisma, { id: ids.lead, appRole: "LEAD" }, { userId: ids.sm, month: "2026-10", role: "SOCIAL_MEDIA", targetTasks: 20 });
      const t = (await loadTargets(db.prisma, ["2026-10"])).find((x) => x.userId === ids.sm)!;
      const reqs = await loadKpiRequests(db.prisma, ["2026-10"]);
      const k = computeKpi(reqs, { id: ids.sm, jobRole: "SOCIAL_MEDIA" }, "2026-10", { role: t.role, targetTasks: t.targetTasks });
      expect(k.tasksDone).toBe(2);
      expect(k.target).toBe(20);
    });
  });

  describe("setTargetWith", () => {
    const input = (o: Record<string, unknown> = {}) => ({ userId: ids.creative, month: "2026-11", role: "DESIGNER" as JobRole, targetTasks: 40, ...o });
    const lead = () => ({ id: ids.lead, appRole: "LEAD" as const });

    it("LEAD and ADMIN ok", async () => {
      expect(await setTargetWith(db.prisma, lead(), input())).toEqual({ ok: true });
      expect(await setTargetWith(db.prisma, { id: ids.admin, appRole: "ADMIN" }, input({ targetTasks: 41 }))).toEqual({ ok: true });
    });
    it("CREATIVE and REQUESTER forbidden", async () => {
      for (const appRole of ["CREATIVE", "REQUESTER"] as const) {
        const r = await setTargetWith(db.prisma, { id: ids.creative, appRole }, input());
        expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
      }
    });
    it("rejects bad input", async () => {
      const bad: Record<string, unknown>[] = [
        { month: "2026-13" }, { month: "abc" }, { month: "2026-1" }, { targetTasks: -1 }, { targetTasks: 10001 },
        { targetTasks: 1.5 }, { targetTasks: NaN }, { role: "BOSS" }, { note: "x".repeat(201) },
      ];
      for (const b of bad) expect(await setTargetWith(db.prisma, lead(), input(b)), JSON.stringify(b)).toMatchObject({ ok: false, code: "INVALID" });
    });
    it("accepts boundaries and trims the note", async () => {
      expect(await setTargetWith(db.prisma, lead(), input({ month: "2027-01", targetTasks: 0 }))).toEqual({ ok: true });
      expect(await setTargetWith(db.prisma, lead(), input({ month: "2027-02", targetTasks: 10000, note: `  ${"x".repeat(200)}  ` }))).toEqual({ ok: true });
      const t = await db.prisma.kpiTarget.findUnique({ where: { userId_month: { userId: ids.creative, month: "2027-02" } } });
      expect(t?.note).toBe("x".repeat(200));
    });
    it("upserts instead of duplicating", async () => {
      await setTargetWith(db.prisma, lead(), input({ month: "2026-12", targetTasks: 10 }));
      await setTargetWith(db.prisma, lead(), input({ month: "2026-12", targetTasks: 25, role: "OTHER" }));
      const rows = await db.prisma.kpiTarget.findMany({ where: { userId: ids.creative, month: "2026-12" } });
      expect(rows).toHaveLength(1);
      expect(rows[0].targetTasks).toBe(25);
      expect(rows[0].role).toBe("OTHER");
    });
    it("unknown user is NOT_FOUND", async () => {
      expect(await setTargetWith(db.prisma, lead(), input({ userId: "nope" }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
  });
});
