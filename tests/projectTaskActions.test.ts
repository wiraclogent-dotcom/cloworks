import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "./helpers/testDb";

// The actions use the session's user and workspace-scoped client; point them at a throwaway database and a switchable user.
const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient, user: { id: "u", appRole: "CREATIVE" as string } }));
vi.mock("@/lib/session", () => ({ requireUser: async () => h.user, dbFor: () => h.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createTaskDetail, deleteTask, moveTask, renameItem, setTaskStatus, setTaskStage } from "@/app/(app)/projects/[id]/tasks/actions";
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
    const ids = async () => (await db.prisma.projectTask.findMany({ where: { projectId }, orderBy: { position: "asc" } })).map((t) => t.id);
    it("swaps a variant with its neighbour in the same item", async () => {
      const [a, b, c] = await seed(["A", "A", "A"]);
      expect(await moveTask(projectId, b.id, "up")).toEqual({ ok: true });
      expect(await ids()).toEqual([b.id, a.id, c.id]);
      expect(await moveTask(projectId, b.id, "down")).toEqual({ ok: true });
      expect(await moveTask(projectId, c.id, "up")).toEqual({ ok: true });
      expect(await ids()).toEqual([a.id, c.id, b.id]);
    });
    it("is a no-op at either end", async () => {
      const [a, , c] = await seed(["A", "A", "A"]);
      expect(await moveTask(projectId, a.id, "up")).toEqual({ ok: true });
      expect(await moveTask(projectId, c.id, "down")).toEqual({ ok: true });
      expect(await order()).toEqual(["A", "A", "A"]);
    });
    it("renumbers duplicate positions so a move always takes effect", async () => {
      const a = await db.prisma.projectTask.create({ data: { projectId, title: "A", subTitle: "1", position: 5 } });
      const b = await db.prisma.projectTask.create({ data: { projectId, title: "A", subTitle: "2", position: 5 } });
      const first = [a, b].sort((x, y) => x.id.localeCompare(y.id));
      expect(await moveTask(projectId, first[1].id, "up")).toEqual({ ok: true });
      const rows = await db.prisma.projectTask.findMany({ where: { projectId }, orderBy: { position: "asc" } });
      expect(rows.map((r) => [r.id, r.position])).toEqual([[first[1].id, 1], [first[0].id, 2]]);
    });
    it("swaps with the nearest row of the same item, leaving other items in place", async () => {
      const [a1, b1, a2] = await seed(["A", "B", "A"]);
      expect(await moveTask(projectId, a2.id, "up")).toEqual({ ok: true });
      const rows = await db.prisma.projectTask.findMany({ where: { projectId }, orderBy: { position: "asc" } });
      expect(rows.map((r) => r.id)).toEqual([a2.id, b1.id, a1.id]);
      expect(await moveTask(projectId, a2.id, "down")).toEqual({ ok: true });
      expect((await db.prisma.projectTask.findMany({ where: { projectId }, orderBy: { position: "asc" } })).map((r) => r.id)).toEqual([a1.id, b1.id, a2.id]);
    });
    it("is a no-op at the edge of an item even when another item is the global neighbour", async () => {
      const rows0 = await seed(["B", "A", "B", "A", "C"]);
      const [, a1, , a2] = rows0;
      expect(await moveTask(projectId, a1.id, "up")).toEqual({ ok: true });
      expect(await moveTask(projectId, a2.id, "down")).toEqual({ ok: true });
      expect((await db.prisma.projectTask.findMany({ where: { projectId }, orderBy: { position: "asc" } })).map((r) => r.id)).toEqual(rows0.map((r) => r.id));
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

  describe("createTaskDetail placement", () => {
    const input = (title: string, subTitle = "") => ({ title, subTitle, ownerId: "", value: "", startDate: "", dueDate: "", fileUrl: "" });
    it("inserts a new variant right after its item's last row", async () => {
      await seed(["A", "B"]);
      const r = await createTaskDetail(projectId, input("A", "new"));
      expect(r.ok).toBe(true);
      const rows = await db.prisma.projectTask.findMany({ where: { projectId }, orderBy: { position: "asc" } });
      expect(rows.map((t) => t.title)).toEqual(["A", "A", "B"]);
      expect(rows[1].subTitle).toBe("new");
      expect(rows.map((t) => t.position)).toEqual([1, 2, 3]);
    });
    it("appends a new item at the bottom", async () => {
      await seed(["A", "B"]);
      await createTaskDetail(projectId, input("C"));
      expect(await order()).toEqual(["A", "B", "C"]);
    });
  });

  describe("renameItem", () => {
    it("renames every row of the item and carries its KPI targets", async () => {
      await seed(["A", "B", "A"]);
      await db.prisma.projectKpiTarget.create({ data: { userId: ownerId, year: 2026, projectId, itemTitle: "A", createdById: ownerId } });
      expect(await renameItem(projectId, "A", "  Z  ")).toEqual({ ok: true });
      expect(await order()).toEqual(["Z", "B", "Z"]);
      expect((await db.prisma.projectKpiTarget.findMany({ where: { projectId } })).map((t) => t.itemTitle)).toEqual(["Z"]);
    });
    it("is a successful no-op for the same title", async () => {
      await seed(["A"]);
      expect(await renameItem(projectId, "A", "A")).toEqual({ ok: true });
      expect(await order()).toEqual(["A"]);
    });
    it("refuses a name another item already has", async () => {
      await seed(["A", "B"]);
      expect(await renameItem(projectId, "A", "B")).toMatchObject({ ok: false, code: "VALIDATION", message: "Another item already has this name." });
      expect(await order()).toEqual(["A", "B"]);
    });
    it("validates the new name and the old title", async () => {
      await seed(["A"]);
      expect(await renameItem(projectId, "A", "   ")).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await renameItem(projectId, "A", "x".repeat(201))).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(await renameItem(projectId, "Nope", "Q")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
    it("needs project.manage", async () => {
      await seed(["A"]);
      h.user = { id: ownerId, appRole: "REQUESTER" };
      expect(await renameItem(projectId, "A", "Z")).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await order()).toEqual(["A"]);
    });
    it("returns NOT_FOUND for a project in another workspace", async () => {
      await db.raw.workspace.create({ data: { id: "other", name: "Other", slug: "other" } });
      const w = { workspaceId: "other" };
      const ou = await db.raw.user.create({ data: { ...w, name: "Ou", fullName: "Ou", email: "ou@example.com" } });
      const fp = await db.raw.project.create({ data: { ...w, title: "Foreign", ownerId: ou.id } });
      await db.raw.projectTask.create({ data: { ...w, projectId: fp.id, position: 1, title: "Poster" } });
      expect(await renameItem(fp.id, "Poster", "Z")).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect((await db.raw.projectTask.findMany({ where: { projectId: fp.id } })).map((t) => t.title)).toEqual(["Poster"]);
    });
  });

  describe("status mode", () => {
    it("setTaskStatus validates and saves a tracker task's status", async () => {
      const [a] = await seed(["A"], { status: "NOT_STARTED" });
      expect(await setTaskStatus(projectId, a.id, "DONE")).toEqual({ ok: true, status: "DONE" });
      expect(await setTaskStatus(projectId, a.id, "WAT" as never)).toMatchObject({ ok: false, code: "VALIDATION" });
      // CANCELLED is a project-level status only: a tracker row can't be set to it.
      expect(await setTaskStatus(projectId, a.id, "CANCELLED")).toMatchObject({ ok: false, code: "VALIDATION" });
      expect((await db.prisma.projectTask.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("DONE");
    });
    it("createTaskDetail rejects CANCELLED as a tracker status", async () => {
      await seed(["A"], { status: "IN_PROGRESS" });
      const r = await createTaskDetail(projectId, { title: "C", subTitle: "", ownerId: "", value: "CANCELLED", startDate: "", dueDate: "", fileUrl: "" });
      expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
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
