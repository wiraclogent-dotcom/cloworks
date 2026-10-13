import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";

// The server actions use the session's user and workspace-scoped client; point them at a throwaway database.
const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient, user: { id: "u", appRole: "LEAD" as string }, revalidated: [] as string[] }));
vi.mock("@/lib/session", () => ({ requireUser: async () => h.user, dbFor: () => h.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { h.revalidated.push(p); } }));

import { loadPersonProjectKpi, loadTeamProjectKpi, targetYears, itemOptions } from "@/lib/kpi/projectQueries";
import { addProjectTargetsWith, removeProjectTargetWith } from "@/lib/kpi/projectTargets";
import { addProjectTargets, removeProjectTarget } from "@/app/(app)/dashboard/projects/actions";

const NOW = new Date("2026-10-13T05:00:00Z");

describe("project KPI loaders and target actions", () => {
  let db: TestDb;
  let lead: { id: string; appRole: "LEAD"; name: string; jobRole: "OTHER"; workspaceId: string; mustChangePassword: boolean };
  let fadliId: string, smId: string, projA: string, projB: string, otherProj: string, otherTarget: string;

  const leadUser = () => ({ id: lead.id, name: "Lead", appRole: "LEAD" as const, jobRole: "OTHER" as const, workspaceId: "clogent", mustChangePassword: false });
  const creativeUser = () => ({ id: fadliId, name: "Fadli", appRole: "CREATIVE" as const, jobRole: "DESIGNER" as const, workspaceId: "clogent", mustChangePassword: false });
  const row = (projectId: string, title: string, extra: object = {}) =>
    db.prisma.projectTask.create({ data: { projectId, title, position: 1, ...extra } });

  beforeAll(async () => {
    db = await createTestDb();
    h.prisma = db.prisma;
    const mk = async (k: string, appRole: "LEAD" | "CREATIVE") =>
      (await db.prisma.user.create({ data: { email: `${k}@clogent.co.id`, name: k, fullName: k, appRole } })).id;
    lead = { id: await mk("lead", "LEAD") } as never;
    fadliId = await mk("fadli", "CREATIVE");
    smId = await mk("sm", "CREATIVE");
    projA = (await db.prisma.project.create({ data: { title: "Alpha", ownerId: lead.id, status: "IN_PROGRESS" } })).id;
    projB = (await db.prisma.project.create({ data: { title: "Beta", ownerId: lead.id, status: "IN_PROGRESS" } })).id;

    // A second workspace with its own project and target.
    await db.raw.workspace.create({ data: { id: "other", name: "Other", slug: "other" } });
    const w = { workspaceId: "other" };
    const ou = await db.raw.user.create({ data: { ...w, name: "Ou", fullName: "Ou", email: "ou@example.com" } });
    otherProj = (await db.raw.project.create({ data: { ...w, title: "Foreign", ownerId: ou.id } })).id;
    await db.raw.projectTask.create({ data: { ...w, projectId: otherProj, position: 1, title: "Poster", ownerId: ou.id } });
    otherTarget = (await db.raw.projectKpiTarget.create({ data: { ...w, userId: ou.id, year: 2026, projectId: otherProj, itemTitle: "Poster", createdById: ou.id } })).id;
  });
  afterAll(async () => { await db?.stop(); });
  beforeEach(async () => {
    h.revalidated.length = 0;
    h.user = { id: lead.id, appRole: "LEAD" };
    await db.prisma.projectKpiTarget.deleteMany({});
    await db.prisma.projectTaskEvent.deleteMany({});
    await db.prisma.projectTask.deleteMany({});
  });

  const target = (userId: string, projectId: string, itemTitle: string, year = 2026) =>
    db.prisma.projectKpiTarget.create({ data: { userId, year, projectId, itemTitle, createdById: lead.id } });

  describe("loadPersonProjectKpi", () => {
    it("buckets Q4, unscheduled, other-year, excluded and otherWork", async () => {
      await row(projA, "Poster", { ownerId: fadliId, stage: "MANUSCRIPT", dueDate: new Date("2026-11-20T00:00:00+07:00") });
      await row(projA, "Banner", { ownerId: fadliId, stage: "NOT_STARTED", dueTbc: true });
      await row(projA, "Flyer", { ownerId: fadliId, stage: "NOT_STARTED", dueDate: new Date("2026-12-01T00:00:00+07:00") }); // not a target
      await row(projA, "Booklet", { ownerId: fadliId, stage: "NOT_STARTED", dueDate: new Date("2027-02-10T00:00:00+07:00") }); // target, moved to 2027
      await row(projA, "Dropped", { ownerId: fadliId, stage: "CANCELLED", dueDate: new Date("2026-11-01T00:00:00+07:00") }); // target, cancelled
      await row(projA, "Old", { ownerId: fadliId, stage: "NOT_STARTED", dueDate: new Date("2025-03-01T00:00:00+07:00") }); // not a target, other year
      const ids: Record<string, string> = {};
      for (const t of ["Poster", "Banner", "Booklet", "Dropped", "Gone"]) ids[t] = (await target(fadliId, projA, t)).id;

      const k = await loadPersonProjectKpi(db.prisma, fadliId, 2026, NOW);
      expect(k.userId).toBe(fadliId);
      expect(k.year).toBe(2026);
      expect(k.quarters[4].items.map((i) => [i.itemTitle, i.targetId])).toEqual([["Poster", ids.Poster]]);
      expect(k.quarters[4].score.items).toBe(1);
      for (const q of [1, 2, 3] as const) expect(k.quarters[q].items).toEqual([]);
      expect(k.unscheduled.map((i) => i.itemTitle).sort()).toEqual(["Banner", "Booklet"]);
      expect(k.unscheduled.find((i) => i.itemTitle === "Booklet")!.bucket).toEqual({ year: 2027, quarter: 1 });
      expect(k.excluded.map((i) => [i.itemTitle, i.state, i.targetId]).sort()).toEqual([
        ["Dropped", "cancelled", ids.Dropped],
        ["Gone", "removed", ids.Gone],
      ]);
      expect(k.otherWork.map((i) => i.itemTitle)).toEqual(["Flyer"]);
      expect(k.yearScore).toBe(k.quarters[4].score.score);
    });

    it("has a null year score and empty buckets when the person has no targets", async () => {
      const k = await loadPersonProjectKpi(db.prisma, smId, 2026, NOW);
      expect(k.yearScore).toBeNull();
      expect(k.unscheduled).toEqual([]);
      expect(k.excluded).toEqual([]);
    });

    it("uses team-wide cycle days for the speed score", async () => {
      // Team items finished in Q4 take 1, 2, 3 and (fadli) 4 days: team median 2.5, fadli's median 4 -> speed 100 * 2.5 / 4 = 62.5 -> 63.
      const done = async (userId: string, title: string, days: number) => {
        const r = await row(projA, title, { ownerId: userId, stage: "FINAL_ARTWORK", startDate: new Date("2026-10-01T00:00:00+07:00"), dueDate: new Date("2026-11-30T00:00:00+07:00") });
        await db.prisma.projectTaskEvent.create({
          data: { taskId: r.id, kind: "STAGE", fromValue: "APPROVAL", toValue: "FINAL_ARTWORK", actorId: userId, at: new Date(new Date("2026-10-01T00:00:00+07:00").getTime() + days * 86_400_000) },
        });
        await target(userId, projA, title);
      };
      await done(smId, "S1", 1);
      await done(smId, "S2", 2);
      await done(smId, "S3", 3);
      await done(fadliId, "F1", 4);

      const k = await loadPersonProjectKpi(db.prisma, fadliId, 2026, NOW);
      expect(k.quarters[4].score.parts.speed).toBe(63);
      const team = await loadTeamProjectKpi(db.prisma, 2026, NOW);
      expect(team.find((p) => p.userId === fadliId)!.quarters[4].score.parts.speed).toBe(63);
    });
  });

  describe("loadTeamProjectKpi", () => {
    it("returns one entry per person with targets, sorted by name", async () => {
      await row(projA, "Poster", { ownerId: fadliId, stage: "MANUSCRIPT", dueDate: new Date("2026-11-20T00:00:00+07:00") });
      await row(projB, "Video", { ownerId: smId, stage: "MANUSCRIPT", dueDate: new Date("2026-11-05T00:00:00+07:00") });
      await target(smId, projB, "Video");
      await target(fadliId, projA, "Poster");
      await target(lead.id, projA, "Poster", 2025); // other year: lead excluded

      const team = await loadTeamProjectKpi(db.prisma, 2026, NOW);
      expect(team.map((p) => p.name)).toEqual(["fadli", "sm"]);
      expect(team[0].quarters[4].items.map((i) => i.itemTitle)).toEqual(["Poster"]);
      expect(team[1].quarters[4].items.map((i) => i.itemTitle)).toEqual(["Video"]);
    });
  });

  describe("targetYears", () => {
    it("lists distinct target years plus the current Jakarta year, descending", async () => {
      await row(projA, "Poster", { ownerId: fadliId });
      await target(fadliId, projA, "Poster", 2024);
      await db.prisma.projectKpiTarget.create({ data: { userId: smId, year: 2024, projectId: projA, itemTitle: "Poster", createdById: lead.id } });
      await target(fadliId, projA, "Other", 2028);
      const years = await targetYears(db.prisma);
      const current = Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }).slice(0, 4));
      expect(years).toEqual([...new Set([2028, 2024, current])].sort((a, b) => b - a));
    });
  });

  describe("itemOptions", () => {
    it("lists each distinct title once with its owners", async () => {
      await row(projA, "Poster", { ownerId: fadliId });
      await row(projA, "Poster", { ownerId: smId, position: 2 });
      await row(projA, "Poster", { ownerId: fadliId, position: 3 });
      await row(projA, "Banner", { ownerId: null });
      const opts = await itemOptions(db.prisma, projA, 2026);
      expect(opts.map((o) => o.itemTitle).sort()).toEqual(["Banner", "Poster"]);
      const poster = opts.find((o) => o.itemTitle === "Poster")!;
      expect(poster.assignedTo.map((a) => a.name).sort()).toEqual(["fadli", "sm"]);
      expect(poster.assignedTo.find((a) => a.name === "sm")!.userId).toBe(smId);
      expect(opts.find((o) => o.itemTitle === "Banner")!.assignedTo).toEqual([]);
    });
  });

  describe("addProjectTargetsWith", () => {
    const input = (over: object = {}) => ({ userId: fadliId, year: 2026, projectId: projA, itemTitles: ["Poster"], ...over });
    beforeEach(async () => { await row(projA, "Poster", { ownerId: fadliId }); await row(projA, "Banner", { ownerId: fadliId, position: 2 }); });

    it("refuses a creative", async () => {
      const r = await addProjectTargetsWith(db.prisma, creativeUser(), input());
      expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await db.prisma.projectKpiTarget.count()).toBe(0);
    });

    it("creates rows for a lead and skips duplicates", async () => {
      expect(await addProjectTargetsWith(db.prisma, leadUser(), input({ itemTitles: ["Poster", "Banner"] }))).toEqual({ ok: true });
      expect(await addProjectTargetsWith(db.prisma, leadUser(), input())).toEqual({ ok: true });
      const rows = await db.prisma.projectKpiTarget.findMany({ orderBy: { itemTitle: "asc" } });
      expect(rows.map((r) => [r.itemTitle, r.userId, r.year, r.createdById])).toEqual([
        ["Banner", fadliId, 2026, lead.id], ["Poster", fadliId, 2026, lead.id],
      ]);
    });

    it("writes nothing when any item title is unknown", async () => {
      const r = await addProjectTargetsWith(db.prisma, leadUser(), input({ itemTitles: ["Poster", "Nope"] }));
      expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await db.prisma.projectKpiTarget.count()).toBe(0);
    });

    it("does not find a project from another workspace", async () => {
      const r = await addProjectTargetsWith(db.prisma, leadUser(), input({ projectId: otherProj }));
      expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await db.prisma.projectKpiTarget.count()).toBe(0);
    });

    it("rejects an unknown or inactive person", async () => {
      expect(await addProjectTargetsWith(db.prisma, leadUser(), input({ userId: "nobody" }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
      await db.prisma.user.update({ where: { id: smId }, data: { active: false } });
      expect(await addProjectTargetsWith(db.prisma, leadUser(), input({ userId: smId }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
      await db.prisma.user.update({ where: { id: smId }, data: { active: true } });
    });

    it("validates year and item titles", async () => {
      for (const year of [2019, 2101, 2026.5, NaN]) {
        expect(await addProjectTargetsWith(db.prisma, leadUser(), input({ year }))).toMatchObject({ ok: false, code: "VALIDATION" });
      }
      expect(await addProjectTargetsWith(db.prisma, leadUser(), input({ itemTitles: [] }))).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await db.prisma.projectKpiTarget.count()).toBe(0);
    });
  });

  describe("removeProjectTargetWith", () => {
    it("deletes for a lead, refuses a creative, and cannot reach another workspace", async () => {
      await row(projA, "Poster", { ownerId: fadliId });
      const t = await target(fadliId, projA, "Poster");
      expect(await removeProjectTargetWith(db.prisma, creativeUser(), t.id)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await db.prisma.projectKpiTarget.count()).toBe(1);
      expect(await removeProjectTargetWith(db.prisma, leadUser(), otherTarget)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await db.raw.projectKpiTarget.count({ where: { id: otherTarget } })).toBe(1);
      expect(await removeProjectTargetWith(db.prisma, leadUser(), t.id)).toMatchObject({ ok: true });
      expect(await db.prisma.projectKpiTarget.count()).toBe(0);
      expect(await removeProjectTargetWith(db.prisma, leadUser(), t.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
  });

  describe("server actions", () => {
    it("add and remove revalidate the dashboard pages", async () => {
      await row(projA, "Poster", { ownerId: fadliId });
      h.user = leadUser();
      expect(await addProjectTargets({ userId: fadliId, year: 2026, projectId: projA, itemTitles: ["Poster"] })).toEqual({ ok: true });
      expect(h.revalidated).toEqual(["/dashboard", "/dashboard/team", `/dashboard/projects/${fadliId}`]);
      h.revalidated.length = 0;
      const t = await db.prisma.projectKpiTarget.findFirstOrThrow({});
      expect(await removeProjectTarget(t.id)).toEqual({ ok: true });
      expect(h.revalidated).toEqual(["/dashboard", "/dashboard/team", `/dashboard/projects/${fadliId}`]);
    });

    it("returns FORBIDDEN as data for a creative", async () => {
      h.user = creativeUser();
      expect(await addProjectTargets({ userId: fadliId, year: 2026, projectId: projA, itemTitles: ["Poster"] })).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(h.revalidated).toEqual([]);
    });
  });
});
