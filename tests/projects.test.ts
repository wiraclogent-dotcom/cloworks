import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createProjectWith, updateProjectWith, ProjectError, groupProjects } from "@/lib/projects";
import { createTestDb, type TestDb } from "./helpers/testDb";

type Role = "REQUESTER" | "CREATIVE" | "LEAD" | "ADMIN";

describe("projects cores", () => {
  let db: TestDb;
  let brandId: string, ownerId: string, goneId: string;
  const actor = (appRole: Role) => ({ id: ownerId, appRole });
  const base = () => ({ title: "Launch", ownerId, status: "IN_PROGRESS" as const });
  const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof ProjectError ? e.code : `other:${e}`));

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    ownerId = (await p.user.create({ data: { email: "o@clogent.co.id", name: "Owner", fullName: "Owner", appRole: "CREATIVE" } })).id;
    goneId = (await p.user.create({ data: { email: "g@clogent.co.id", name: "Gone", fullName: "Gone", appRole: "CREATIVE", active: false } })).id;
    brandId = (await p.brand.create({ data: { name: "Brand A" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  const get = (id: string) => db.prisma.project.findUniqueOrThrow({ where: { id } });

  describe("createProjectWith", () => {
    it("stores dates as Jakarta midnight instants", async () => {
      const { id } = await createProjectWith(db.prisma, actor("CREATIVE"), {
        ...base(), subTitle: "  sub ", brandId, startDate: "2026-10-05", dueDate: "2026-10-30", fileUrl: "https://drive.google.com/x",
      });
      const p = await get(id);
      expect(p.startDate?.toISOString()).toBe("2026-10-04T17:00:00.000Z");
      expect(p.dueDate?.toISOString()).toBe("2026-10-29T17:00:00.000Z");
      expect(p.subTitle).toBe("sub");
      expect(p.brandId).toBe(brandId);
      expect(p.status).toBe("IN_PROGRESS");
    });
    it("allows a project with no dates, brand or file", async () => {
      const { id } = await createProjectWith(db.prisma, actor("CREATIVE"), { ...base(), subTitle: "", brandId: "", startDate: "", dueDate: "", fileUrl: "" });
      const p = await get(id);
      expect([p.startDate, p.dueDate, p.brandId, p.fileUrl, p.subTitle]).toEqual([null, null, null, null, null]);
    });
    it("allows equal dates, rejects due before start", async () => {
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), startDate: "2026-10-05", dueDate: "2026-10-05" }))).toBe("ok");
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), startDate: "2026-10-06", dueDate: "2026-10-05" }))).toBe("VALIDATION");
    });
    it("rejects invalid calendar dates and formats", async () => {
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), startDate: "2026-02-30" }))).toBe("VALIDATION");
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), dueDate: "10/05/2026" }))).toBe("VALIDATION");
    });
    it("rejects unknown brand, unknown or inactive owner", async () => {
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), brandId: "nope" }))).toBe("VALIDATION");
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), ownerId: "nope" }))).toBe("VALIDATION");
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), ownerId: goneId }))).toBe("VALIDATION");
    });
    it("rejects non-http file links", async () => {
      for (const fileUrl of ["javascript:alert(1)", "data:text/html,x", "ftp://x/y", "not a url"])
        expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), fileUrl }))).toBe("VALIDATION");
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), fileUrl: "https://x.test/" + "a".repeat(2050) }))).toBe("VALIDATION");
    });
    it("rejects empty/over-long title, long subtitle, bad status", async () => {
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), title: "   " }))).toBe("VALIDATION");
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), title: "a".repeat(201) }))).toBe("VALIDATION");
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), subTitle: "a".repeat(201) }))).toBe("VALIDATION");
      expect(await code(createProjectWith(db.prisma, actor("LEAD"), { ...base(), status: "WAT" as never }))).toBe("VALIDATION");
    });
    it("enforces project.manage", async () => {
      expect(await code(createProjectWith(db.prisma, actor("REQUESTER"), base()))).toBe("FORBIDDEN");
      for (const r of ["CREATIVE", "LEAD", "ADMIN"] as const) expect(await code(createProjectWith(db.prisma, actor(r), base()))).toBe("ok");
    });
  });

  describe("updateProjectWith", () => {
    const mk = async () =>
      (await createProjectWith(db.prisma, actor("LEAD"), { ...base(), subTitle: "s", brandId, startDate: "2026-10-05", dueDate: "2026-10-30", fileUrl: "https://a.test/" })).id;

    it("keeps untouched fields on a partial patch", async () => {
      const id = await mk();
      await updateProjectWith(db.prisma, actor("CREATIVE"), id, { status: "DONE" });
      const p = await get(id);
      expect(p.status).toBe("DONE");
      expect([p.title, p.subTitle, p.brandId, p.fileUrl]).toEqual(["Launch", "s", brandId, "https://a.test/"]);
      expect(p.dueDate?.toISOString()).toBe("2026-10-29T17:00:00.000Z");
    });
    it("clears with null or empty string", async () => {
      const id = await mk();
      await updateProjectWith(db.prisma, actor("ADMIN"), id, { subTitle: null, brandId: "", startDate: null, dueDate: "", fileUrl: "" });
      const p = await get(id);
      expect([p.subTitle, p.brandId, p.startDate, p.dueDate, p.fileUrl]).toEqual([null, null, null, null, null]);
    });
    it("checks date order against the merged result", async () => {
      const id = await mk();
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { dueDate: "2026-10-01" }))).toBe("VALIDATION");
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { startDate: "2026-11-01" }))).toBe("VALIDATION");
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { startDate: "2026-11-01", dueDate: "2026-11-02" }))).toBe("ok");
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { startDate: null, dueDate: "2026-01-01" }))).toBe("ok");
    });
    it("validates changed owner/brand/url/title", async () => {
      const id = await mk();
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { ownerId: goneId }))).toBe("VALIDATION");
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { brandId: "nope" }))).toBe("VALIDATION");
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { fileUrl: "javascript:1" }))).toBe("VALIDATION");
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { title: "" }))).toBe("VALIDATION");
    });
    it("keeps an unchanged inactive owner editable; checks owner only when changed", async () => {
      const id = await mk();
      await db.prisma.project.update({ where: { id }, data: { ownerId: goneId } });
      const full = { title: "Launch", ownerId: goneId, status: "DONE" as const, startDate: "2026-10-06", dueDate: "2026-11-01" };
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, full))).toBe("ok");
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { status: "ON_HOLD" }))).toBe("ok");
      expect((await get(id)).status).toBe("ON_HOLD");
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { ownerId: "nope" }))).toBe("VALIDATION");
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { ownerId }))).toBe("ok");
      expect((await get(id)).ownerId).toBe(ownerId);
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), id, { ownerId: goneId }))).toBe("VALIDATION");
      expect((await get(id)).ownerId).toBe(ownerId);
    });
    it("NOT_FOUND for unknown id (even with an empty patch), empty patch is a no-op", async () => {
      expect(await code(updateProjectWith(db.prisma, actor("LEAD"), "missing", {}))).toBe("NOT_FOUND");
      const id = await mk();
      const before = await get(id);
      await updateProjectWith(db.prisma, actor("LEAD"), id, {});
      expect(await get(id)).toEqual(before);
    });
    it("enforces project.manage", async () => {
      const id = await mk();
      expect(await code(updateProjectWith(db.prisma, actor("REQUESTER"), id, { status: "DONE" }))).toBe("FORBIDDEN");
      expect((await get(id)).status).toBe("IN_PROGRESS");
      for (const r of ["CREATIVE", "LEAD", "ADMIN"] as const) expect(await code(updateProjectWith(db.prisma, actor(r), id, { status: "ON_HOLD" }))).toBe("ok");
    });
  });

  describe("groupProjects", () => {
    const d = (s: string | null) => (s ? new Date(`${s}T00:00:00+07:00`) : null);
    const row = (id: string, brandName: string | null, due: string | null) => ({ id, title: id, brandName, dueDate: d(due) });
    it("groups by brand name, No brand last, due asc nulls last", () => {
      const g = groupProjects([row("a", null, "2026-01-01"), row("b", "Zed", null), row("c", "Zed", "2026-03-01"), row("d", "Alpha", "2026-05-01"), row("e", "Zed", "2026-02-01")]);
      expect(g.map((x) => x.brand)).toEqual(["Alpha", "Zed", null]);
      expect(g[1].projects.map((p) => p.id)).toEqual(["e", "c", "b"]);
    });
  });
});
