import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { PrismaClient, ProjectStage, ProjectStatus } from "@prisma/client";
import { createTestDb, type TestDb } from "./helpers/testDb";

// The actions use the session's user and workspace-scoped client; point them at a throwaway database and a switchable user.
const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient, user: { id: "u", appRole: "CREATIVE" as string } }));
vi.mock("@/lib/session", () => ({ requireUser: async () => h.user, dbFor: () => h.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { setItemStage, setItemStatus } from "@/app/(app)/projects/[id]/tasks/actions";

describe("setItemStage / setItemStatus (bulk set-all for an item)", () => {
  let db: TestDb;
  let ownerId: string, projectId: string, foreignProjectId: string;

  beforeAll(async () => {
    db = await createTestDb();
    h.prisma = db.prisma;
    ownerId = (await db.prisma.user.create({ data: { email: "o@clogent.co.id", name: "Owner", fullName: "Owner", appRole: "CREATIVE" } })).id;
    h.user = { id: ownerId, appRole: "CREATIVE" };
    projectId = (await db.prisma.project.create({ data: { title: "Tracker", ownerId, status: "IN_PROGRESS" } })).id;
    // A second workspace with its own project and item.
    await db.raw.workspace.create({ data: { id: "other", name: "Other", slug: "other" } });
    const w = { workspaceId: "other" };
    const ou = await db.raw.user.create({ data: { ...w, name: "Ou", fullName: "Ou", email: "ou@example.com" } });
    foreignProjectId = (await db.raw.project.create({ data: { ...w, title: "Foreign", ownerId: ou.id } })).id;
    await db.raw.projectTask.create({ data: { ...w, projectId: foreignProjectId, position: 1, title: "Poster", stage: "MANUSCRIPT" } });
  });
  afterAll(async () => { await db?.stop(); });
  beforeEach(async () => {
    h.user = { id: ownerId, appRole: "CREATIVE" };
    await db.prisma.projectTaskEvent.deleteMany({});
    await db.prisma.projectTask.deleteMany({ where: { projectId } });
  });

  let pos = 0;
  const seedRow = (title: string, extra: { stage?: ProjectStage | null; status?: ProjectStatus | null; subTitle?: string }) =>
    db.prisma.projectTask.create({ data: { projectId, title, position: ++pos, ...extra } });
  const rows = async (title: string) => db.prisma.projectTask.findMany({ where: { projectId, title }, orderBy: { position: "asc" } });
  const events = () => db.prisma.projectTaskEvent.findMany();

  describe("guards", () => {
    it("refuses a user without project.manage and changes nothing", async () => {
      await seedRow("Poster", { stage: "MANUSCRIPT", subTitle: "A" });
      h.user = { id: ownerId, appRole: "REQUESTER" };
      expect(await setItemStage(projectId, "Poster", "APPROVAL")).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await setItemStatus(projectId, "Poster", "DONE")).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect((await rows("Poster")).map((r) => r.stage)).toEqual(["MANUSCRIPT"]);
      expect(await events()).toHaveLength(0);
    });
    it("returns NOT_FOUND for an unknown title", async () => {
      await seedRow("Poster", { stage: "MANUSCRIPT" });
      expect(await setItemStage(projectId, "Nope", "APPROVAL")).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await setItemStatus(projectId, "Nope", "DONE")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
    it("returns NOT_FOUND for a project in another workspace", async () => {
      expect(await setItemStage(foreignProjectId, "Poster", "APPROVAL")).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await setItemStatus(foreignProjectId, "Poster", "DONE")).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect((await db.raw.projectTask.findMany({ where: { projectId: foreignProjectId } })).map((r) => r.stage)).toEqual(["MANUSCRIPT"]);
    });
    it("rejects an invalid stage", async () => {
      await seedRow("Poster", { stage: "MANUSCRIPT" });
      expect(await setItemStage(projectId, "Poster", "BOGUS" as ProjectStage)).toMatchObject({ ok: false, code: "VALIDATION" });
    });
    it("rejects CANCELLED as a status", async () => {
      await seedRow("Poster", { status: "IN_PROGRESS" });
      expect(await setItemStatus(projectId, "Poster", "CANCELLED")).toMatchObject({ ok: false, code: "VALIDATION" });
    });
  });

  describe("setItemStage", () => {
    it("sets every non-cancelled row and writes one event per changed row", async () => {
      await seedRow("Poster", { stage: "MANUSCRIPT", subTitle: "A" });
      await seedRow("Poster", { stage: "APPROVAL", subTitle: "B" });
      await seedRow("Poster", { stage: "CANCELLED", subTitle: "C" });
      await seedRow("Poster", { stage: null, subTitle: "D" });
      expect(await setItemStage(projectId, "Poster", "APPROVAL")).toEqual({ ok: true, changed: 2 });
      expect((await rows("Poster")).map((r) => r.stage)).toEqual(["APPROVAL", "APPROVAL", "CANCELLED", "APPROVAL"]);
      const evs = await events();
      expect(evs).toHaveLength(2);
      expect(evs.map((e) => [e.kind, e.fromValue, e.toValue, e.actorId]).sort()).toEqual([
        ["STAGE", "MANUSCRIPT", "APPROVAL", ownerId],
        ["STAGE", null, "APPROVAL", ownerId],
      ].sort());
    });
    it("sets everything, including a cancelled row, when the target is CANCELLED", async () => {
      await seedRow("Poster", { stage: "MANUSCRIPT", subTitle: "A" });
      await seedRow("Poster", { stage: "CANCELLED", subTitle: "B" });
      expect(await setItemStage(projectId, "Poster", "CANCELLED")).toEqual({ ok: true, changed: 1 });
      expect((await rows("Poster")).map((r) => r.stage)).toEqual(["CANCELLED", "CANCELLED"]);
      expect(await events()).toHaveLength(1);
    });
    it("leaves other items in the same project untouched", async () => {
      await seedRow("Poster", { stage: "MANUSCRIPT", subTitle: "A" });
      await seedRow("Banner", { stage: "MANUSCRIPT", subTitle: "A" });
      expect(await setItemStage(projectId, "Poster", "APPROVAL")).toEqual({ ok: true, changed: 1 });
      expect((await rows("Banner")).map((r) => r.stage)).toEqual(["MANUSCRIPT"]);
      expect(await events()).toHaveLength(1);
    });
  });

  describe("setItemStatus", () => {
    it("sets rows not already at the target and writes one STATUS event", async () => {
      await seedRow("Poster", { status: "IN_PROGRESS", subTitle: "A" });
      await seedRow("Poster", { status: "DONE", subTitle: "B" });
      expect(await setItemStatus(projectId, "Poster", "DONE")).toEqual({ ok: true, changed: 1 });
      expect((await rows("Poster")).map((r) => r.status)).toEqual(["DONE", "DONE"]);
      const evs = await events();
      expect(evs).toHaveLength(1);
      expect(evs[0]).toMatchObject({ kind: "STATUS", fromValue: "IN_PROGRESS", toValue: "DONE" });
    });
    it("leaves other items in the same project untouched", async () => {
      await seedRow("Poster", { status: "IN_PROGRESS", subTitle: "A" });
      await seedRow("Banner", { status: "IN_PROGRESS", subTitle: "A" });
      expect(await setItemStatus(projectId, "Poster", "DONE")).toEqual({ ok: true, changed: 1 });
      expect((await rows("Banner")).map((r) => r.status)).toEqual(["IN_PROGRESS"]);
    });
  });
});
