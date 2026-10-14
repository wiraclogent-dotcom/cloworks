import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createRequestWith, validateRequestInput, insertRequestTx, CreateRequestError, type CreateRequestInput } from "@/lib/createRequest";
import { CREATIVE_TEAM } from "@/lib/team";
import { ASSIGNEE_ORDER } from "@/lib/assignees";
import { seed } from "../prisma/seedCore";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let user: { id: string; appRole: "REQUESTER" };
let base: CreateRequestInput;
let socialTypeId: string;
let inactiveTypeId: string;
// 2026-10-08 12:00 Jakarta
const now = new Date("2026-10-08T05:00:00Z");

beforeAll(async () => {
  db = await createTestDb();
  await seed(db.prisma);
  const u = await db.prisma.user.findFirstOrThrow({ where: { name: "Yosi" } });
  user = { id: u.id, appRole: "REQUESTER" };
  const brand = await db.prisma.brand.findFirstOrThrow();
  const division = await db.prisma.division.findFirstOrThrow();
  const type = await db.prisma.requestType.findFirstOrThrow({ where: { name: "General Design" } });
  socialTypeId = (await db.prisma.requestType.findFirstOrThrow({ where: { name: "Social Media" } })).id;
  inactiveTypeId = (await db.prisma.requestType.create({ data: { name: "Retired", active: false } })).id;
  base = { title: "Poster", brandId: brand.id, divisionId: division.id, typeId: type.id, deadline: null, fields: {} };
});
afterAll(async () => db.stop());

async function rejects(input: CreateRequestInput, code = "VALIDATION") {
  const before = await db.prisma.request.count();
  const err = await createRequestWith(db.prisma, user, input, now).catch((e) => e);
  expect(err).toBeInstanceOf(CreateRequestError);
  expect((err as CreateRequestError).code).toBe(code);
  expect(await db.prisma.request.count()).toBe(before);
  return err as CreateRequestError;
}

describe("createRequestWith", () => {
  it("reports base and cross-field errors together (empty title AND past deadline)", async () => {
    const err = await rejects({ ...base, title: "  ", deadline: "2026-10-01" });
    expect(err.fieldErrors).toMatchObject({ title: "Title is required", deadline: "Deadline cannot be in the past" });
  });
  it("reports a bad deadline format, unknown refs and missing title in one pass", async () => {
    const err = await rejects({ ...base, title: "", brandId: "nope", deadline: null });
    expect(Object.keys(err.fieldErrors!).sort()).toEqual(["brandId", "title"]);
  });

  it("creates a REQUESTED request with exactly one first event", async () => {
    const { id } = await createRequestWith(db.prisma, user, { ...base, title: "  Poster  ", notes: "n", briefUrl: "https://drive.google.com/x" }, now);
    const r = await db.prisma.request.findUniqueOrThrow({ where: { id }, include: { statusEvents: true } });
    expect(r.title).toBe("Poster");
    expect(r.status).toBe("REQUESTED");
    expect(r.requesterId).toBe(user.id);
    expect(r.assigneeId).toBeNull();
    expect(await db.prisma.requestAssignee.count({ where: { requestId: id } })).toBe(0);
    expect(r.outputCount).toBe(1);
    expect(r.includeKpi).toBe(true);
    expect(r.requestedAt).toEqual(now);
    expect(r.deadline).toBeNull();
    expect(r.statusEvents).toHaveLength(1);
    expect(r.statusEvents[0]).toMatchObject({ from: null, to: "REQUESTED", actorId: user.id });
    expect(r.statusEvents[0].at).toEqual(now);
  });

  it("writes one RequestAssignee row per assignee and keeps assigneeId as the first", async () => {
    const [a, b] = await db.prisma.user.findMany({ where: CREATIVE_TEAM, orderBy: { name: "asc" }, take: 2 });
    const { id } = await createRequestWith(db.prisma, user, { ...base, title: "Two people", assigneeIds: [a.id, b.id, a.id] }, now);
    const r = await db.prisma.request.findUniqueOrThrow({ where: { id }, include: { assignees: true } });
    expect(r.assignees.map((x) => x.userId).sort()).toEqual([a.id, b.id].sort());
    expect(r.assignees.every((x) => x.workspaceId === db.workspaceId)).toBe(true);
    expect(r.assigneeId).toBe(a.id);
  });
  it("keeps the pick order: [b, a] lists b then a even when a's id sorts first", async () => {
    const team = await db.prisma.user.findMany({ where: CREATIVE_TEAM, take: 2 });
    const [a, b] = team.sort((x, y) => (x.id < y.id ? -1 : 1));
    const { id } = await createRequestWith(db.prisma, user, { ...base, title: "Pick order", assigneeIds: [b.id, a.id] }, now);
    const r = await db.prisma.request.findUniqueOrThrow({ where: { id }, include: { assignees: { orderBy: [...ASSIGNEE_ORDER] } } });
    expect(r.assignees.map((x) => x.userId)).toEqual([b.id, a.id]);
    expect(r.assigneeId).toBe(b.id);
  });
  it("rejects an assignee who is not on the creative team under assigneeIds", async () => {
    const [a] = await db.prisma.user.findMany({ where: CREATIVE_TEAM, take: 1 });
    const e = await rejects({ ...base, assigneeIds: [a.id, user.id] });
    expect(e.fieldErrors?.assigneeIds).toBe("Pick someone from the creative team");
  });

  it.each(["", "   "])("rejects blank title %j", async (title) => {
    const e = await rejects({ ...base, title });
    expect(e.fieldErrors?.title).toBeTruthy();
  });
  it("rejects title over 200 chars", async () => {
    await rejects({ ...base, title: "x".repeat(201) });
  });
  it("rejects non-http briefUrl", async () => {
    const e = await rejects({ ...base, briefUrl: "ftp://x.com/a" });
    expect(e.fieldErrors?.briefUrl).toBeTruthy();
  });

  it("rejects deadline yesterday (Jakarta)", async () => {
    const e = await rejects({ ...base, deadline: "2026-10-07" });
    expect(e.fieldErrors?.deadline).toBeTruthy();
  });
  it("accepts deadline today, stored as Jakarta midnight", async () => {
    const { id } = await createRequestWith(db.prisma, user, { ...base, deadline: "2026-10-08" }, now);
    const r = await db.prisma.request.findUniqueOrThrow({ where: { id } });
    expect(r.deadline?.toISOString()).toBe("2026-10-07T17:00:00.000Z");
  });
  it("uses the Jakarta date for 'today' near UTC midnight", async () => {
    // 2026-10-08 20:00Z is already 2026-10-09 03:00 in Jakarta
    const late = new Date("2026-10-08T20:00:00Z");
    await expect(createRequestWith(db.prisma, user, { ...base, deadline: "2026-10-08" }, late)).rejects.toBeInstanceOf(CreateRequestError);
    await expect(createRequestWith(db.prisma, user, { ...base, deadline: "2026-10-09" }, late)).resolves.toBeTruthy();
  });
  it.each(["2026-02-30", "2026-13-01", "10/12/2026", "2026-10-8"])("rejects invalid date %s", async (d) => {
    await rejects({ ...base, deadline: d });
  });

  it("rejects nonexistent brand / division / type", async () => {
    expect((await rejects({ ...base, brandId: "nope" })).fieldErrors?.brandId).toBeTruthy();
    expect((await rejects({ ...base, divisionId: "nope" })).fieldErrors?.divisionId).toBeTruthy();
    expect((await rejects({ ...base, typeId: "nope" })).fieldErrors?.typeId).toBeTruthy();
  });
  it("rejects inactive type", async () => {
    expect((await rejects({ ...base, typeId: inactiveTypeId })).fieldErrors?.typeId).toBeTruthy();
  });

  it("validates fields against the type schema", async () => {
    const e = await rejects({ ...base, typeId: socialTypeId, fields: {} });
    expect(e.fieldErrors?.["fields.platform"]).toBeTruthy();
    const ok = await createRequestWith(
      db.prisma, user,
      { ...base, typeId: socialTypeId, fields: { platform: "TikTok", contentType: "Daily", shooting: true } }, now);
    const r = await db.prisma.request.findUniqueOrThrow({ where: { id: ok.id } });
    expect(r.fields).toEqual({ platform: "TikTok", contentType: "Daily", shooting: true });
  });
  it("rejects extra fields for a type without schema", async () => {
    await rejects({ ...base, fields: { sneaky: "x" } });
  });

  it("is atomic: a failing event insert leaves no request", async () => {
    const before = await db.prisma.request.count();
    const failing = new Proxy(db.prisma, {
      get(t, p, rcv) {
        if (p === "$transaction")
          return (fn: (tx: PrismaClient) => Promise<unknown>) =>
            t.$transaction((tx) =>
              fn(new Proxy(tx, { get: (tt, pp) => (pp === "statusEvent" ? { create: async () => { throw new Error("boom"); } } : Reflect.get(tt, pp)) }) as PrismaClient));
        return Reflect.get(t, p, rcv);
      },
    }) as PrismaClient;
    await expect(createRequestWith(failing, user, base, now)).rejects.toThrow("boom");
    expect(await db.prisma.request.count()).toBe(before);
  });

  it("FORBIDDEN: a role without request.create is rejected (invalid role injected; every real role has the grant)", async () => {
    const before = await db.prisma.request.count();
    const bad = { id: user.id, appRole: "NOBODY" as never };
    const err = await createRequestWith(db.prisma, bad, base, now).catch((e) => e);
    expect(err).toBeInstanceOf(CreateRequestError);
    expect(err.code).toBe("FORBIDDEN");
    expect(await db.prisma.request.count()).toBe(before);
  });
  it("leap day: 2028-02-29 accepted, 2027-02-29 rejected", async () => {
    const early = new Date("2027-01-01T00:00:00Z");
    await expect(createRequestWith(db.prisma, user, { ...base, deadline: "2028-02-29" }, early)).resolves.toBeTruthy();
    await expect(createRequestWith(db.prisma, user, { ...base, deadline: "2027-02-29" }, early)).rejects.toBeInstanceOf(CreateRequestError);
  });
  it("rejects __proto__ / constructor in fields", async () => {
    await rejects({ ...base, fields: JSON.parse('{"__proto__":{"a":1}}') });
    await rejects({ ...base, fields: { constructor: "x" } });
  });
  it("ignores a client-supplied requesterId", async () => {
    const other = await db.prisma.user.findFirstOrThrow({ where: { name: "Rahmat" } });
    const { id } = await createRequestWith(db.prisma, user, { ...base, requesterId: other.id, status: "DONE" } as CreateRequestInput, now);
    const r = await db.prisma.request.findUniqueOrThrow({ where: { id } });
    expect(r.requesterId).toBe(user.id);
    expect(r.status).toBe("REQUESTED");
  });
});

describe("validateRequestInput + insertRequestTx", () => {
  it("stores requester and status-event actor separately and honours outputCount", async () => {
    const author = await db.prisma.user.findFirstOrThrow({ where: { name: "Rahmat" } });
    const v = await validateRequestInput(db.prisma, { ...base, title: "  Carousel  ", needsMotion: true }, now);
    expect(v.title).toBe("Carousel");
    const { id } = await db.prisma.$transaction((tx) =>
      insertRequestTx(tx, v, { requesterId: author.id, actorId: user.id, outputCount: 3, now }),
    );
    const r = await db.prisma.request.findUniqueOrThrow({ where: { id }, include: { statusEvents: true } });
    expect(r.requesterId).toBe(author.id);
    expect(r.outputCount).toBe(3);
    expect(r.status).toBe("REQUESTED");
    expect(r.includeKpi).toBe(true);
    expect(r.needsMotion).toBe(true);
    expect(r.statusEvents).toHaveLength(1);
    expect(r.statusEvents[0].actorId).toBe(user.id);
  });
  it("defaults outputCount to 1 and validate throws VALIDATION", async () => {
    const v = await validateRequestInput(db.prisma, base, now);
    const { id } = await db.prisma.$transaction((tx) => insertRequestTx(tx, v, { requesterId: user.id, actorId: user.id, now }));
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id } })).outputCount).toBe(1);
    const err = await validateRequestInput(db.prisma, { ...base, title: "" }, now).catch((e) => e);
    expect(err).toBeInstanceOf(CreateRequestError);
    expect(err.code).toBe("VALIDATION");
  });
});
