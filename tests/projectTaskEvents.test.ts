import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "./helpers/testDb";

// Same setup as projectTaskActions.test.ts: a throwaway database and a switchable user behind the session mock.
const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient, user: { id: "u", appRole: "CREATIVE" as string } }));
vi.mock("@/lib/session", () => ({ requireUser: async () => h.user, dbFor: () => h.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { setTaskDate, setTaskDetail, setTaskStage, setTaskStatus } from "@/app/(app)/projects/[id]/tasks/actions";
import { jakartaDay } from "@/lib/projectTasks";

describe("project task event logging", () => {
  let db: TestDb;
  let ownerId: string, designerId: string, projectId: string;

  beforeAll(async () => {
    db = await createTestDb();
    h.prisma = db.prisma;
    ownerId = (await db.prisma.user.create({ data: { email: "o@clogent.co.id", name: "Owner", fullName: "Owner", appRole: "CREATIVE" } })).id;
    designerId = (await db.prisma.user.create({ data: { email: "d@clogent.co.id", name: "Des", fullName: "Des", appRole: "CREATIVE", jobRole: "DESIGNER" } })).id;
    h.user = { id: ownerId, appRole: "CREATIVE" };
    projectId = (await db.prisma.project.create({ data: { title: "Tracker", ownerId, status: "IN_PROGRESS" } })).id;
  });
  afterAll(async () => { await db?.stop(); });
  beforeEach(async () => {
    h.user = { id: ownerId, appRole: "CREATIVE" };
    await db.prisma.projectKpiTarget.deleteMany({});
    await db.prisma.projectTaskEvent.deleteMany({});
    await db.prisma.projectTask.deleteMany({});
  });

  const task = (title: string, extra: object = {}) => db.prisma.projectTask.create({ data: { projectId, title, position: 1, ...extra } });
  const events = () => db.prisma.projectTaskEvent.findMany({});

  it("logs a stage change with actor", async () => {
    const t = await task("A", { stage: "MANUSCRIPT" });
    expect(await setTaskStage(projectId, t.id, "APPROVAL")).toEqual({ ok: true, stage: "APPROVAL" });
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ taskId: t.id, kind: "STAGE", fromValue: "MANUSCRIPT", toValue: "APPROVAL", actorId: ownerId });
  });

  it("writes no event when the stage is unchanged", async () => {
    const t = await task("A", { stage: "MANUSCRIPT" });
    await setTaskStage(projectId, t.id, "MANUSCRIPT");
    expect(await events()).toHaveLength(0);
  });

  it("logs a status change", async () => {
    const t = await task("A", { status: "IN_PROGRESS" });
    await setTaskStatus(projectId, t.id, "DONE");
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "STATUS", fromValue: "IN_PROGRESS", toValue: "DONE" });
  });

  it("writes no event when the status is unchanged", async () => {
    const t = await task("A", { status: "IN_PROGRESS" });
    await setTaskStatus(projectId, t.id, "IN_PROGRESS");
    expect(await events()).toHaveLength(0);
  });

  it("logs a due date change", async () => {
    const t = await task("A", { dueDate: jakartaDay("2026-11-15") });
    await setTaskDate(projectId, t.id, "due", "2026-11-30");
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "DUE", fromValue: "2026-11-15", toValue: "2026-11-30" });
  });

  it("logs setting a due date from nothing, and clearing it", async () => {
    const t = await task("A");
    await setTaskDate(projectId, t.id, "due", "2026-11-30");
    await setTaskDate(projectId, t.id, "due", "");
    const ev = (await events()).sort((a, b) => a.at.getTime() - b.at.getTime());
    expect(ev.map((e) => [e.fromValue, e.toValue])).toEqual([[null, "2026-11-30"], ["2026-11-30", null]]);
  });

  it("writes no event for a start date change or an unchanged due date", async () => {
    const t = await task("A", { dueDate: jakartaDay("2026-11-15") });
    await setTaskDate(projectId, t.id, "start", "2026-11-01");
    await setTaskDate(projectId, t.id, "due", "2026-11-15");
    expect(await events()).toHaveLength(0);
  });

  it("writes no event when the action is forbidden", async () => {
    const t = await task("A", { stage: "MANUSCRIPT", status: "IN_PROGRESS" });
    h.user = { id: ownerId, appRole: "REQUESTER" };
    expect((await setTaskStage(projectId, t.id, "APPROVAL")).ok).toBe(false);
    expect((await setTaskStatus(projectId, t.id, "DONE")).ok).toBe(false);
    expect((await setTaskDate(projectId, t.id, "due", "2026-11-30")).ok).toBe(false);
    expect(await events()).toHaveLength(0);
  });

  describe("renaming an item carries its KPI targets", () => {
    const target = (title: string, userId = designerId, year = 2026) =>
      db.prisma.projectKpiTarget.create({ data: { userId, year, projectId, itemTitle: title, createdById: ownerId } });
    const titles = async () => (await db.prisma.projectKpiTarget.findMany({ orderBy: { itemTitle: "asc" } })).map((t) => t.itemTitle);

    it("moves the target when the only row with that title is renamed", async () => {
      const t = await task("Regular 4");
      await target("Regular 4");
      expect(await setTaskDetail(projectId, t.id, "title", "Regular 4 Pcs")).toEqual({ ok: true });
      expect(await titles()).toEqual(["Regular 4 Pcs"]);
    });

    it("keeps the target when another row still has the old title", async () => {
      const a = await task("Regular 4");
      await db.prisma.projectTask.create({ data: { projectId, title: "Regular 4", subTitle: "Blue", position: 2 } });
      await target("Regular 4");
      await setTaskDetail(projectId, a.id, "title", "Regular 4 Pcs");
      expect(await titles()).toEqual(["Regular 4"]);
    });

    it("deletes the old target instead of duplicating when the new title already has one", async () => {
      const t = await task("Regular 4");
      await target("Regular 4");
      await target("Regular 4 Pcs");
      await target("Regular 4", designerId, 2027); // different year: just moves
      await setTaskDetail(projectId, t.id, "title", "Regular 4 Pcs");
      const rows = await db.prisma.projectKpiTarget.findMany({ orderBy: [{ year: "asc" }] });
      expect(rows.map((r) => [r.year, r.itemTitle])).toEqual([[2026, "Regular 4 Pcs"], [2027, "Regular 4 Pcs"]]);
    });

    it("does not touch targets when a sub title changes", async () => {
      const t = await task("Regular 4");
      await target("Regular 4");
      await setTaskDetail(projectId, t.id, "subTitle", "Blue");
      expect(await titles()).toEqual(["Regular 4"]);
    });
  });
});
