import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "./helpers/testDb";

// The actions use the app's `prisma` and session; point them at a throwaway database and a switchable user.
const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient, user: { id: "u", appRole: "CREATIVE" as string } }));
vi.mock("@/lib/db", () => ({ get prisma() { return h.prisma; } }));
vi.mock("@/lib/session", () => ({ requireUser: async () => h.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createTaskDetail, deleteTask, moveTask, setTaskStatus, setTaskStage } from "@/app/(app)/projects/[id]/tasks/actions";
import { createMilestone, deleteMilestone, updateMilestone } from "@/app/(app)/projects/[id]/actions";

describe("project task and milestone actions", () => {
  let db: TestDb;
  let ownerId: string, projectId: string, otherProjectId: string;

  beforeAll(async () => {
    db = await createTestDb();
    h.prisma = db.prisma;
    ownerId = (await db.prisma.user.create({ data: { email: "o@clogent.co.id", name: "Owner", fullName: "Owner", appRole: "CREATIVE" } })).id;
    h.user = { id: ownerId, appRole: "CREATIVE" };
    projectId = (await db.prisma.project.create({ data: { title: "Tracker", ownerId, status: "IN_PROGRESS" } })).id;
    otherProjectId = (await db.prisma.project.create({ data: { title: "Other", ownerId, status: "IN_PROGRESS" } })).id;
  });
  afterAll(async () => { await db?.stop(); });
  beforeEach(async () => {
    h.user = { id: ownerId, appRole: "CREATIVE" };
    await db.prisma.projectTask.deleteMany({});
    await db.prisma.projectMilestone.deleteMany({});
  });

  const seed = (titles: string[], extra: object = {}) =>
    Promise.all(titles.map((title, i) => db.prisma.projectTask.create({ data: { projectId, title, position: i + 1, ...extra } })));
  const order = async () => (await db.prisma.projectTask.findMany({ where: { projectId }, orderBy: { position: "asc" } })).map((t) => t.title);

  describe("deleteTask", () => {
    it("removes a row of this project", async () => {
      const [a] = await seed(["A", "B"]);
      expect(await deleteTask(projectId, a.id)).toEqual({ ok: true });
      expect(await order()).toEqual(["B"]);
    });
    it("refuses a row from another project", async () => {
      const [a] = await seed(["A"]);
      expect(await deleteTask(otherProjectId, a.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await order()).toEqual(["A"]);
    });
    it("needs project.manage", async () => {
      const [a] = await seed(["A"]);
      h.user = { id: ownerId, appRole: "REQUESTER" };
      expect(await deleteTask(projectId, a.id)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await order()).toEqual(["A"]);
    });
  });

  describe("moveTask", () => {
    it("swaps a row with its neighbour", async () => {
      const [, b, c] = await seed(["A", "B", "C"]);
      expect(await moveTask(projectId, b.id, "up")).toEqual({ ok: true });
      expect(await order()).toEqual(["B", "A", "C"]);
      expect(await moveTask(projectId, b.id, "down")).toEqual({ ok: true });
      expect(await moveTask(projectId, c.id, "up")).toEqual({ ok: true });
      expect(await order()).toEqual(["A", "C", "B"]);
    });
    it("is a no-op at either end", async () => {
      const [a, , c] = await seed(["A", "B", "C"]);
      expect(await moveTask(projectId, a.id, "up")).toEqual({ ok: true });
      expect(await moveTask(projectId, c.id, "down")).toEqual({ ok: true });
      expect(await order()).toEqual(["A", "B", "C"]);
    });
    it("renumbers duplicate positions so a move always takes effect", async () => {
      const a = await db.prisma.projectTask.create({ data: { projectId, title: "A", position: 5 } });
      const b = await db.prisma.projectTask.create({ data: { projectId, title: "B", position: 5 } });
      const first = [a, b].sort((x, y) => x.id.localeCompare(y.id));
      expect(await moveTask(projectId, first[1].id, "up")).toEqual({ ok: true });
      const rows = await db.prisma.projectTask.findMany({ where: { projectId }, orderBy: { position: "asc" } });
      expect(rows.map((r) => [r.id, r.position])).toEqual([[first[1].id, 1], [first[0].id, 2]]);
    });
    it("rejects other projects' rows, bad directions and non-managers", async () => {
      const [a] = await seed(["A", "B"]);
      expect(await moveTask(otherProjectId, a.id, "down")).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await moveTask(projectId, a.id, "sideways" as never)).toMatchObject({ ok: false, code: "VALIDATION" });
      h.user = { id: ownerId, appRole: "REQUESTER" };
      expect(await moveTask(projectId, a.id, "down")).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await order()).toEqual(["A", "B"]);
    });
  });

  describe("status mode", () => {
    it("setTaskStatus validates and saves a tracker task's status", async () => {
      const [a] = await seed(["A"], { status: "NOT_STARTED" });
      expect(await setTaskStatus(projectId, a.id, "DONE")).toEqual({ ok: true, status: "DONE" });
      expect(await setTaskStatus(projectId, a.id, "WAT" as never)).toMatchObject({ ok: false, code: "VALIDATION" });
      expect((await db.prisma.projectTask.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("DONE");
    });
    it("createTaskDetail takes a status in a tracker project and appends to the bottom", async () => {
      await seed(["A"], { status: "IN_PROGRESS" });
      const r = await createTaskDetail(projectId, { title: "B", subTitle: "", ownerId: "", value: "IN_REVIEW", startDate: "", dueDate: "", fileUrl: "" });
      expect(r.ok).toBe(true);
      const b = await db.prisma.projectTask.findFirstOrThrow({ where: { projectId, title: "B" } });
      expect([b.status, b.stage, b.position]).toEqual(["IN_REVIEW", null, 2]);
      expect(await createTaskDetail(projectId, { title: "C", subTitle: "", ownerId: "", value: "MANUSCRIPT", startDate: "", dueDate: "", fileUrl: "" }))
        .toMatchObject({ ok: false, code: "VALIDATION" });
    });
    it("setTaskStage refuses a row from another project", async () => {
      const [a] = await seed(["A"]);
      expect(await setTaskStage(otherProjectId, a.id, "APPROVAL")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
  });

  describe("milestones", () => {
    it("creates, edits and deletes a milestone", async () => {
      const created = await createMilestone(projectId, { title: " Client review ", date: "2026-10-20", done: false });
      expect(created.ok).toBe(true);
      const id = (created as { id: string }).id;
      let m = await db.prisma.projectMilestone.findUniqueOrThrow({ where: { id } });
      expect([m.title, m.date.toISOString(), m.done]).toEqual(["Client review", "2026-10-19T17:00:00.000Z", false]);

      expect(await updateMilestone(projectId, id, { title: "Final review", date: "2026-10-22", done: true })).toEqual({ ok: true, id });
      m = await db.prisma.projectMilestone.findUniqueOrThrow({ where: { id } });
      expect([m.title, m.date.toISOString(), m.done]).toEqual(["Final review", "2026-10-21T17:00:00.000Z", true]);

      expect(await deleteMilestone(projectId, id)).toEqual({ ok: true, id });
      expect(await db.prisma.projectMilestone.count()).toBe(0);
    });
    it("validates name and date", async () => {
      expect(await createMilestone(projectId, { title: "  ", date: "2026-10-20", done: false })).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await createMilestone(projectId, { title: "x".repeat(201), date: "2026-10-20", done: false })).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await createMilestone(projectId, { title: "Review", date: "", done: false })).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await createMilestone(projectId, { title: "Review", date: "2026-02-30", done: false })).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await createMilestone("nope", { title: "Review", date: "2026-10-20", done: false })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
    it("keeps milestones to their own project and needs project.manage", async () => {
      const m = await db.prisma.projectMilestone.create({ data: { projectId, title: "Kickoff", date: new Date() } });
      expect(await updateMilestone(otherProjectId, m.id, { title: "X", date: "2026-10-20", done: false })).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await deleteMilestone(otherProjectId, m.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      h.user = { id: ownerId, appRole: "REQUESTER" };
      expect(await createMilestone(projectId, { title: "X", date: "2026-10-20", done: false })).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await updateMilestone(projectId, m.id, { title: "X", date: "2026-10-20", done: false })).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await deleteMilestone(projectId, m.id)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect((await db.prisma.projectMilestone.findUniqueOrThrow({ where: { id: m.id } })).title).toBe("Kickoff");
    });
  });
});
