import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequestWith, CreateRequestError, type CreateRequestInput } from "@/lib/createRequest";
import { setNeedsMotionWith } from "@/lib/collab";
import { listBoardColumns, listRequests, listRequestsPage } from "@/lib/requests";
import { seed } from "../prisma/seedCore";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let user: { id: string; appRole: "REQUESTER" };
let base: { title: string; brandId: string; divisionId: string; deadline: null };
let generalId: string;
const now = new Date("2026-10-08T05:00:00Z");
const actor = async (name: string, appRole: "REQUESTER" | "CREATIVE" | "LEAD" | "ADMIN") => ({ id: (await db.prisma.user.findFirstOrThrow({ where: { name } })).id, appRole });

beforeAll(async () => {
  db = await createTestDb();
  await seed(db.prisma);
  user = { id: (await db.prisma.user.findFirstOrThrow({ where: { name: "Yosi" } })).id, appRole: "REQUESTER" };
  base = {
    title: "Poster", deadline: null,
    brandId: (await db.prisma.brand.findFirstOrThrow()).id,
    divisionId: (await db.prisma.division.findFirstOrThrow()).id,
  };
  generalId = (await db.prisma.requestType.findFirstOrThrow({ where: { name: "General Design" } })).id;
}, 120_000);
afterAll(async () => { await db?.stop(); });

describe("createRequestWith: default type and needsMotion", () => {
  it("applies the General Design type and empty fields when typeId/fields are omitted", async () => {
    const { id } = await createRequestWith(db.prisma, user, base as CreateRequestInput, now);
    const r = await db.prisma.request.findUniqueOrThrow({ where: { id } });
    expect(r.typeId).toBe(generalId);
    expect(r.fields).toEqual({});
    expect(r.needsMotion).toBe(false);
  });
  it("stores needsMotion true and false", async () => {
    const yes = await createRequestWith(db.prisma, user, { ...base, needsMotion: true } as CreateRequestInput, now);
    const no = await createRequestWith(db.prisma, user, { ...base, needsMotion: false } as CreateRequestInput, now);
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: yes.id } })).needsMotion).toBe(true);
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: no.id } })).needsMotion).toBe(false);
  });
  it("rejects a non-boolean needsMotion", async () => {
    const err = await createRequestWith(db.prisma, user, { ...base, needsMotion: "yes" } as unknown as CreateRequestInput, now).catch((e) => e);
    expect(err).toBeInstanceOf(CreateRequestError);
    expect(err.code).toBe("VALIDATION");
  });
  it("an explicit typeId (and its fields) still works", async () => {
    const social = await db.prisma.requestType.findFirstOrThrow({ where: { name: "Social Media" } });
    const { id } = await createRequestWith(db.prisma, user, { ...base, typeId: social.id, fields: { platform: "TikTok", contentType: "Daily" } } as CreateRequestInput, now);
    const r = await db.prisma.request.findUniqueOrThrow({ where: { id } });
    expect(r.typeId).toBe(social.id);
    expect(r.fields).toEqual({ platform: "TikTok", contentType: "Daily" });
  });
  it.each([["missing", null], ["inactive", false]])("returns a clear VALIDATION error when the default type is %s", async (_n, active) => {
    const before = await db.prisma.request.count();
    if (active === null) await db.prisma.requestType.update({ where: { id: generalId }, data: { name: "General Design (old)" } });
    else await db.prisma.requestType.update({ where: { id: generalId }, data: { active: false } });
    try {
      const err = await createRequestWith(db.prisma, user, base as CreateRequestInput, now).catch((e) => e);
      expect(err).toBeInstanceOf(CreateRequestError);
      expect(err.code).toBe("VALIDATION");
      expect(err.message).toBe("The default request type 'General Design' is missing");
      expect(await db.prisma.request.count()).toBe(before);
    } finally {
      await db.prisma.requestType.update({ where: { id: generalId }, data: { name: "General Design", active: true } });
    }
  });
});

describe("setNeedsMotionWith", () => {
  let reqId: string;
  beforeAll(async () => { reqId = (await createRequestWith(db.prisma, user, base as CreateRequestInput, now)).id; });

  it("is FORBIDDEN for requesters and creatives and changes nothing", async () => {
    expect(await setNeedsMotionWith(db.prisma, user, reqId, true)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await setNeedsMotionWith(db.prisma, await actor("Fadli", "CREATIVE"), reqId, true)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: reqId } })).needsMotion).toBe(false);
  });
  it("returns INVALID for a non-boolean and NOT_FOUND for an unknown request", async () => {
    const lead = await actor("Idzni", "LEAD");
    expect(await setNeedsMotionWith(db.prisma, lead, reqId, "yes" as unknown as boolean)).toMatchObject({ ok: false, code: "INVALID" });
    expect(await setNeedsMotionWith(db.prisma, lead, "nope", true)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
  it("lets a lead and an admin persist the flag", async () => {
    expect(await setNeedsMotionWith(db.prisma, await actor("Idzni", "LEAD"), reqId, true)).toEqual({ ok: true });
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: reqId } })).needsMotion).toBe(true);
    const admin = await db.prisma.user.findFirstOrThrow({ where: { appRole: "ADMIN" } });
    expect(await setNeedsMotionWith(db.prisma, { id: admin.id, appRole: "ADMIN" }, reqId, false)).toEqual({ ok: true });
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: reqId } })).needsMotion).toBe(false);
  });
});

describe("motion filter", () => {
  const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();
  beforeAll(async () => {
    await db.prisma.request.deleteMany({});
    const mk = (title: string, needsMotion: boolean, status: "REQUESTED" | "DONE") =>
      createRequestWith(db.prisma, user, { ...base, title, needsMotion } as CreateRequestInput, now).then((r) => status === "DONE" ? db.prisma.request.update({ where: { id: r.id }, data: { status } }) : r);
    await mk("m1", true, "REQUESTED"); await mk("m2", true, "DONE"); await mk("n1", false, "REQUESTED"); await mk("n2", false, "REQUESTED"); await mk("n3", false, "DONE");
  });

  it("listRequests: yes / no / any, and rows expose needsMotion", async () => {
    const yes = await listRequests(db.prisma, { needsMotion: true });
    expect(titles(yes)).toEqual(["m1", "m2"]);
    expect(yes.every((r) => r.needsMotion)).toBe(true);
    const no = await listRequests(db.prisma, { needsMotion: false });
    expect(titles(no)).toEqual(["n1", "n2", "n3"]);
    expect(no.some((r) => r.needsMotion)).toBe(false);
    expect(await listRequests(db.prisma, {})).toHaveLength(5);
  });
  it("listBoardColumns: totals per column and rows follow the filter", async () => {
    const cols = async (needsMotion?: boolean) => Object.fromEntries((await listBoardColumns(db.prisma, { needsMotion })).map((c) => [c.status, [c.total, titles(c.rows)]]));
    expect(await cols(true)).toMatchObject({ REQUESTED: [1, ["m1"]], ON_PROGRESS: [0, []], DONE: [1, ["m2"]] });
    expect(await cols(false)).toMatchObject({ REQUESTED: [2, ["n1", "n2"]], DONE: [1, ["n3"]] });
    expect(await cols(undefined)).toMatchObject({ REQUESTED: [3, ["m1", "n1", "n2"]], DONE: [2, ["m2", "n3"]] });
  });
  it("listRequestsPage applies the filter to the total and the rows", async () => {
    const p = await listRequestsPage(db.prisma, { needsMotion: true }, { sort: "title", dir: "asc", page: 1 });
    expect(p.total).toBe(2);
    expect(titles(p.rows)).toEqual(["m1", "m2"]);
  });
});

describe("migration 'request_needs_motion'", () => {
  const dir = fs.readdirSync(path.join(__dirname, "../prisma/migrations")).find((d) => d.endsWith("_request_needs_motion"));
  it("exists and adds the column NOT NULL DEFAULT false", async () => {
    expect(dir).toBeTruthy();
    const sql = fs.readFileSync(path.join(__dirname, "../prisma/migrations", dir!, "migration.sql"), "utf8");
    expect(sql).toContain('ALTER TABLE "Request" ADD COLUMN "needsMotion" BOOLEAN NOT NULL DEFAULT false');
    const col = await db.prisma.$queryRaw<{ is_nullable: string; column_default: string }[]>`SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = 'Request' AND column_name = 'needsMotion'`;
    expect(col).toEqual([{ is_nullable: "NO", column_default: "false" }]);
  });
  it("rows that existed before the column keep false", async () => {
    // Replay the migration statement on a scratch table that already holds rows.
    const sql = fs.readFileSync(path.join(__dirname, "../prisma/migrations", dir!, "migration.sql"), "utf8").replace(/"Request"/g, '"Scratch"');
    await db.prisma.$executeRawUnsafe('CREATE TABLE "Scratch" ("id" TEXT PRIMARY KEY)');
    await db.prisma.$executeRawUnsafe(`INSERT INTO "Scratch" ("id") VALUES ('a'), ('b')`);
    await db.prisma.$executeRawUnsafe(sql);
    expect(await db.prisma.$queryRawUnsafe(`SELECT "needsMotion" FROM "Scratch" ORDER BY "id"`)).toEqual([{ needsMotion: false }, { needsMotion: false }]);
  });
  it("an insert that omits the column (importer style) gets false", async () => {
    const r = await db.prisma.request.findFirstOrThrow({ where: { title: "n1" } });
    expect(r.needsMotion).toBe(false);
  });
});
