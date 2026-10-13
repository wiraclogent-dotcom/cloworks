import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";

// The server action uses the session's user and workspace-scoped client; point them at a throwaway database.
const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient, user: { id: "u", appRole: "LEAD" as string }, revalidated: [] as string[], unauth: false }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (h.unauth) throw Object.assign(new Error("Unauthenticated"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    return h.user;
  },
  dbFor: () => h.prisma,
}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { h.revalidated.push(p); } }));

import { loadRosterEntries, rosterCandidates, setRosterWith, setKpiRosterWith, rosterPeople } from "@/lib/kpi/roster";
import { loadTeamProjectKpi } from "@/lib/kpi/projectQueries";
import { setKpiRoster } from "@/app/(app)/dashboard/team/actions";

describe("Team KPI roster", () => {
  let db: TestDb;
  let leadId: string, anaId: string, budiId: string, caraId: string, reqId: string, goneId: string, foreignId: string, projectId: string;
  const lead = () => ({ id: leadId, appRole: "LEAD" as const });
  const creative = () => ({ id: anaId, appRole: "CREATIVE" as const });

  const entries = (kind: "REQUESTS" | "PROJECTS") =>
    db.raw.kpiRosterEntry.findMany({ where: { kind }, orderBy: { userId: "asc" } }).then((rows) => rows.map((r) => [r.userId, r.included] as const));

  beforeAll(async () => {
    db = await createTestDb();
    h.prisma = db.prisma;
    const mk = async (k: string, appRole: "LEAD" | "CREATIVE" | "REQUESTER", extra: object = {}) =>
      (await db.prisma.user.create({ data: { email: `${k}@clogent.co.id`, name: k, fullName: k, appRole, ...extra } })).id;
    leadId = await mk("Lena", "LEAD");
    anaId = await mk("Ana", "CREATIVE", { jobRole: "DESIGNER" });
    budiId = await mk("Budi", "CREATIVE", { jobRole: "OTHER" });
    caraId = await mk("Cara", "CREATIVE", { jobRole: "OTHER" });
    reqId = await mk("Rani", "REQUESTER");
    goneId = await mk("Gone", "CREATIVE", { active: false });
    projectId = (await db.prisma.project.create({ data: { title: "Alpha", ownerId: leadId, status: "IN_PROGRESS" } })).id;
    await db.raw.workspace.create({ data: { id: "other", name: "Other", slug: "other" } });
    foreignId = (await db.raw.user.create({ data: { workspaceId: "other", name: "Foreign", fullName: "Foreign", email: "f@example.com", appRole: "CREATIVE" } })).id;
  });
  afterAll(async () => { await db?.stop(); });
  beforeEach(async () => {
    h.revalidated.length = 0;
    h.unauth = false;
    h.user = { id: leadId, appRole: "LEAD" };
    await db.raw.kpiRosterEntry.deleteMany({});
    await db.prisma.projectKpiTarget.deleteMany({});
  });

  describe("rosterCandidates", () => {
    it("lists active non-requesters of the workspace by name", async () => {
      const c = await rosterCandidates(db.prisma);
      expect(c.map((x) => x.name)).toEqual(["Ana", "Budi", "Cara", "Lena"]);
      expect(c.map((x) => x.id)).not.toContain(foreignId);
    });
  });

  describe("setRosterWith", () => {
    it("is forbidden for a creative and writes nothing", async () => {
      const r = await setRosterWith(db.prisma, creative(), { kind: "REQUESTS", userIds: [anaId], automaticIds: [] });
      expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await entries("REQUESTS")).toEqual([]);
    });

    it("rejects a requester or an inactive id with NOT_FOUND and writes nothing", async () => {
      for (const bad of [reqId, goneId, "nope"]) {
        const r = await setRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [budiId, bad], automaticIds: [anaId] });
        expect(r, bad).toMatchObject({ ok: false, code: "NOT_FOUND" });
      }
      expect(await entries("REQUESTS")).toEqual([]);
    });

    it("rejects an id from another workspace with NOT_FOUND", async () => {
      const r = await setRosterWith(db.prisma, lead(), { kind: "PROJECTS", userIds: [foreignId], automaticIds: [] });
      expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await db.raw.kpiRosterEntry.count()).toBe(0);
    });

    it("rejects malformed input with VALIDATION", async () => {
      const bad: unknown[] = [
        null, {}, { kind: "OTHER", userIds: [], automaticIds: [] }, { kind: "REQUESTS", userIds: "a", automaticIds: [] },
        { kind: "REQUESTS", userIds: [1], automaticIds: [] }, { kind: "REQUESTS", userIds: [""], automaticIds: [] },
        { kind: "REQUESTS", userIds: Array.from({ length: 201 }, (_, i) => `x${i}`), automaticIds: [] },
      ];
      for (const input of bad) {
        const r = await setRosterWith(db.prisma, lead(), input as never);
        expect(r, JSON.stringify(input)).toMatchObject({ ok: false, code: "VALIDATION" });
      }
    });

    it("writes included=false when a lead removes an automatic person, and deleting it again re-adds them", async () => {
      const auto = [anaId, budiId];
      expect(await setRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [budiId], automaticIds: auto })).toEqual({ ok: true });
      expect(await entries("REQUESTS")).toEqual([[anaId, false]]);
      expect(await setRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [anaId, budiId], automaticIds: auto })).toEqual({ ok: true });
      expect(await entries("REQUESTS")).toEqual([]);
    });

    it("writes included=true for a non-automatic person and stores who changed it", async () => {
      const r = await setRosterWith(db.prisma, lead(), { kind: "PROJECTS", userIds: [caraId], automaticIds: [] });
      expect(r).toEqual({ ok: true });
      const row = await db.raw.kpiRosterEntry.findFirstOrThrow({ where: { userId: caraId } });
      expect(row).toMatchObject({ kind: "PROJECTS", included: true, updatedById: leadId, workspaceId: "clogent" });
    });

    it("keeps Requests and Projects overrides separate and updates an existing override", async () => {
      await setRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [caraId], automaticIds: [] });
      await setRosterWith(db.prisma, lead(), { kind: "PROJECTS", userIds: [], automaticIds: [caraId] });
      expect(await entries("REQUESTS")).toEqual([[caraId, true]]);
      expect(await entries("PROJECTS")).toEqual([[caraId, false]]);
      await setRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [], automaticIds: [caraId] });
      expect(await entries("REQUESTS")).toEqual([[caraId, false]]);
      expect(await db.raw.kpiRosterEntry.count()).toBe(2);
    });

    it("leaves non-candidate automatic people alone", async () => {
      // goneId is automatic (e.g. a designer with a target who has since left) but cannot be picked in the dialog.
      await setRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [anaId], automaticIds: [goneId, anaId] });
      expect(await entries("REQUESTS")).toEqual([]);
    });
  });

  describe("setKpiRosterWith / setKpiRoster", () => {
    it("computes the Projects automatic list server-side from the year's targets", async () => {
      await db.prisma.projectKpiTarget.create({ data: { userId: anaId, year: 2026, projectId, itemTitle: "X", createdById: leadId } });
      // Ana is automatic in 2026; the client "keeps" only Budi, so Ana is removed and Budi added.
      const r = await setKpiRosterWith(db.prisma, lead(), { kind: "PROJECTS", userIds: [budiId], year: 2026 });
      expect(r).toEqual({ ok: true });
      expect(await entries("PROJECTS")).toEqual(
        [[anaId, false], [budiId, true]].sort((a, b) => (a[0] as string).localeCompare(b[0] as string)),
      );
    });

    it("computes the Requests automatic list from the creative team and the month's DESIGNER targets", async () => {
      // Ana is a DESIGNER on the creative team; Budi has a DESIGNER target this month.
      await db.prisma.kpiTarget.create({ data: { userId: budiId, month: "2026-10", role: "DESIGNER", targetTasks: 3 } });
      const r = await setKpiRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [anaId, budiId, caraId], month: "2026-10" });
      expect(r).toEqual({ ok: true });
      expect(await entries("REQUESTS")).toEqual([[caraId, true]]);
    });

    it("validates month and year", async () => {
      expect(await setKpiRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [], month: "2026-13" })).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await setKpiRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [] })).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await setKpiRosterWith(db.prisma, lead(), { kind: "PROJECTS", userIds: [], year: 1999 })).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await setKpiRosterWith(db.prisma, lead(), { kind: "PROJECTS", userIds: [], year: 2026.5 })).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await setKpiRosterWith(db.prisma, lead(), { kind: "PROJECTS", userIds: [] })).toMatchObject({ ok: false, code: "VALIDATION" });
    });

    it("the action is forbidden for creatives, reports unauthenticated as data, and revalidates on success", async () => {
      h.user = { id: anaId, appRole: "CREATIVE" };
      expect(await setKpiRoster({ kind: "PROJECTS", userIds: [caraId], year: 2026 })).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await entries("PROJECTS")).toEqual([]);
      h.unauth = true;
      expect(await setKpiRoster({ kind: "PROJECTS", userIds: [caraId], year: 2026 })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
      h.unauth = false;
      h.user = { id: leadId, appRole: "LEAD" };
      expect(await setKpiRoster({ kind: "PROJECTS", userIds: [caraId], year: 2026 })).toEqual({ ok: true });
      expect(h.revalidated).toContain("/dashboard/team");
      expect(await entries("PROJECTS")).toEqual([[caraId, true]]);
    });
  });

  describe("loadRosterEntries and rosterPeople", () => {
    it("returns the entries of one kind", async () => {
      await setRosterWith(db.prisma, lead(), { kind: "REQUESTS", userIds: [caraId], automaticIds: [] });
      await setRosterWith(db.prisma, lead(), { kind: "PROJECTS", userIds: [budiId], automaticIds: [] });
      expect(await loadRosterEntries(db.prisma, "REQUESTS")).toEqual([{ userId: caraId, included: true }]);
    });

    it("applies overrides to the automatic people, loading added names and dropping stale ones", async () => {
      const auto = [{ id: anaId, name: "Ana", jobRole: "DESIGNER" as const }, { id: budiId, name: "Budi", jobRole: "OTHER" as const }];
      await db.raw.kpiRosterEntry.createMany({ data: [
        { userId: budiId, kind: "REQUESTS", included: false, updatedById: leadId, workspaceId: "clogent" },
        { userId: caraId, kind: "REQUESTS", included: true, updatedById: leadId, workspaceId: "clogent" },
        { userId: goneId, kind: "REQUESTS", included: true, updatedById: leadId, workspaceId: "clogent" }, // inactive since: dropped
        { userId: reqId, kind: "REQUESTS", included: true, updatedById: leadId, workspaceId: "clogent" }, // demoted to requester: dropped
      ] });
      const people = await rosterPeople(db.prisma, "REQUESTS", auto);
      expect(people.map((p) => p.name)).toEqual(["Ana", "Cara"]);
      expect(people[1]).toMatchObject({ id: caraId, jobRole: "OTHER" });
    });
  });

  describe("loadTeamProjectKpi with a roster", () => {
    const NOW = new Date("2026-10-13T05:00:00Z");
    it("adds a person with no targets (null scores, their name) and hides a removed person who has targets", async () => {
      await db.prisma.projectTask.create({ data: { projectId, title: "Poster", position: 1, ownerId: anaId, stage: "MANUSCRIPT", dueDate: new Date("2026-11-20T00:00:00+07:00") } });
      await db.prisma.projectKpiTarget.create({ data: { userId: anaId, year: 2026, projectId, itemTitle: "Poster", createdById: leadId } });
      await db.prisma.projectKpiTarget.create({ data: { userId: budiId, year: 2026, projectId, itemTitle: "Poster", createdById: leadId } });

      const plain = await loadTeamProjectKpi(db.prisma, 2026, NOW);
      expect(plain.map((k) => k.name)).toEqual(["Ana", "Budi"]);

      const k = await loadTeamProjectKpi(db.prisma, 2026, NOW, { extraUserIds: [caraId], excludeUserIds: [budiId] });
      expect(k.map((x) => x.name)).toEqual(["Ana", "Cara"]);
      const cara = k.find((x) => x.userId === caraId)!;
      expect(cara.yearScore).toBeNull();
      for (const q of [1, 2, 3, 4] as const) {
        expect(cara.quarters[q].score.score).toBeNull();
        expect(cara.quarters[q].items).toEqual([]);
      }
      expect(cara.unscheduled).toEqual([]);
    });

    it("an exclusion beats an extra id, and extra ids that are inactive or requesters are dropped", async () => {
      const k = await loadTeamProjectKpi(db.prisma, 2026, NOW, { extraUserIds: [caraId, goneId, reqId, budiId], excludeUserIds: [budiId] });
      expect(k.map((x) => x.name)).toEqual(["Cara"]);
    });
  });
});
