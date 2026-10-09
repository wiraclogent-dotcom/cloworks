import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { makeScoped, scopedDb } from "@/lib/db";
import { createTestDb, type TestDb } from "./helpers/testDb";

// Every scoped model, by Prisma client key, with a harmless field change for update tests.
const MODELS = {
  user: { name: "hacked" },
  allowedEmail: { note: "hacked" },
  brand: { name: "hacked" },
  division: { name: "hacked" },
  requestType: { name: "hacked" },
  request: { title: "hacked" },
  statusEvent: { at: new Date(0) },
  deadlineEvent: { at: new Date(0) },
  comment: { body: "hacked" },
  attachment: { name: "hacked" },
  kpiTarget: { note: "hacked" },
  notification: { message: "hacked" },
  project: { title: "hacked" },
  projectTask: { title: "hacked" },
  projectMilestone: { title: "hacked" },
} as const;
type ModelKey = keyof typeof MODELS;
const KEYS = Object.keys(MODELS) as ModelKey[];

type Row = { id: string; workspaceId: string } & Record<string, unknown>;
/** The subset of a model delegate the suite drives generically. */
interface Delegate {
  findMany(a?: object): Promise<Row[]>;
  findFirst(a: object): Promise<Row | null>;
  findUnique(a: object): Promise<Row | null>;
  count(a?: object): Promise<number>;
  aggregate(a: object): Promise<{ _count: number }>;
  groupBy(a: object): Promise<{ workspaceId: string; _count: number }[]>;
  update(a: object): Promise<Row>;
  updateMany(a: object): Promise<{ count: number }>;
  delete(a: object): Promise<Row>;
  deleteMany(a: object): Promise<{ count: number }>;
}
const del = (c: unknown, m: ModelKey) => (c as Record<ModelKey, Delegate>)[m];

let db: TestDb;
let clogent: Record<ModelKey, string>;
let other: Record<ModelKey, string>;

/** A full row set in one workspace, written through the raw client with explicit workspaceIds. */
async function buildRows(raw: PrismaClient, workspaceId: string, tag: string): Promise<Record<ModelKey, string>> {
  const w = { workspaceId };
  const user = await raw.user.create({ data: { ...w, name: `U-${tag}`, fullName: `User ${tag}`, email: `u-${tag}@example.com` } });
  const allowedEmail = await raw.allowedEmail.create({ data: { ...w, email: "shared@example.com" } });
  const brand = await raw.brand.create({ data: { ...w, name: "Main" } });
  const division = await raw.division.create({ data: { ...w, name: "Ops" } });
  const requestType = await raw.requestType.create({ data: { ...w, name: "Design" } });
  const request = await raw.request.create({
    data: { ...w, title: `R-${tag}`, brandId: brand.id, divisionId: division.id, typeId: requestType.id, requesterId: user.id },
  });
  const statusEvent = await raw.statusEvent.create({ data: { ...w, requestId: request.id, to: "REQUESTED", actorId: user.id } });
  const deadlineEvent = await raw.deadlineEvent.create({ data: { ...w, requestId: request.id, to: new Date(), actorId: user.id } });
  const comment = await raw.comment.create({ data: { ...w, requestId: request.id, authorId: user.id, body: "hi" } });
  const attachment = await raw.attachment.create({ data: { ...w, requestId: request.id, uploaderId: user.id, name: "f", url: "https://x/f" } });
  const notification = await raw.notification.create({ data: { ...w, userId: user.id, requestId: request.id, type: "t", message: "m" } });
  const kpiTarget = await raw.kpiTarget.create({ data: { ...w, userId: user.id, month: "2026-10", role: "DESIGNER", targetTasks: 5 } });
  const project = await raw.project.create({ data: { ...w, code: "P1", title: `P-${tag}`, ownerId: user.id, brandId: brand.id } });
  const projectTask = await raw.projectTask.create({ data: { ...w, projectId: project.id, position: 0, title: "T" } });
  const projectMilestone = await raw.projectMilestone.create({ data: { ...w, projectId: project.id, title: "M", date: new Date() } });
  return {
    user: user.id, allowedEmail: allowedEmail.id, brand: brand.id, division: division.id, requestType: requestType.id,
    request: request.id, statusEvent: statusEvent.id, deadlineEvent: deadlineEvent.id, comment: comment.id,
    attachment: attachment.id, notification: notification.id, kpiTarget: kpiTarget.id, project: project.id,
    projectTask: projectTask.id, projectMilestone: projectMilestone.id,
  };
}

beforeAll(async () => {
  db = await createTestDb();
  await db.raw.workspace.create({ data: { id: "other", name: "Other", slug: "other" } });
  clogent = await buildRows(db.raw, "clogent", "c");
  other = await buildRows(db.raw, "other", "o");
});
afterAll(async () => {
  await db?.stop();
});

describe("workspace isolation", () => {
  it("scoped reads never see another workspace", async () => {
    const s = makeScoped(db.raw, "clogent");
    for (const m of KEYS) {
      const d = del(s, m);
      const rows = await d.findMany();
      expect(rows.length, m).toBeGreaterThan(0);
      expect(rows.every((r) => r.workspaceId === "clogent"), m).toBe(true);
      expect(rows.map((r) => r.id), m).toContain(clogent[m]);
      expect(await d.findFirst({ where: { id: other[m] } }), m).toBeNull();
      expect(await d.findUnique({ where: { id: other[m] } }), m).toBeNull();
      expect(await d.findUnique({ where: { id: clogent[m] } }), m).not.toBeNull();

      const rawCount = await del(db.raw, m).count({ where: { workspaceId: "clogent" } });
      expect(await d.count(), m).toBe(rawCount);
      expect((await d.aggregate({ _count: true }))._count, m).toBe(rawCount);
      const groups = await d.groupBy({ by: ["workspaceId"], _count: true });
      expect(groups, m).toEqual([{ workspaceId: "clogent", _count: rawCount }]);
    }
  });

  it("scoped writes cannot touch another workspace", async () => {
    const s = makeScoped(db.raw, "clogent");
    const before = await Promise.all(KEYS.map((m) => del(db.raw, m).findUnique({ where: { id: other[m] } })));
    for (const m of KEYS) {
      const d = del(s, m);
      const data = MODELS[m];
      await expect(d.update({ where: { id: other[m] }, data }), m).rejects.toMatchObject({ code: "P2025" });
      expect(await d.updateMany({ where: { id: other[m] }, data }), m).toEqual({ count: 0 });
      expect(await d.deleteMany({ where: { id: other[m] } }), m).toEqual({ count: 0 });
    }
    // Delete children first, so a missing filter would succeed rather than hit a foreign key.
    for (const m of [...KEYS].reverse()) {
      await expect(del(s, m).delete({ where: { id: other[m] } }), m).rejects.toMatchObject({ code: "P2025" });
    }
    const upserted = await s.brand.upsert({ where: { id: other.brand }, update: { name: "hacked" }, create: { name: "Upserted" } });
    expect(upserted).toMatchObject({ name: "Upserted", workspaceId: "clogent" });

    const after = await Promise.all(KEYS.map((m) => del(db.raw, m).findUnique({ where: { id: other[m] } })));
    expect(after).toEqual(before);
  });

  it("creates are stamped and a foreign workspaceId throws", async () => {
    const s = makeScoped(db.raw, "clogent");
    expect(await s.brand.create({ data: { name: "X" } })).toMatchObject({ workspaceId: "clogent" });
    await s.division.createMany({ data: [{ name: "D1" }, { name: "D2" }] });
    const made = await db.raw.division.findMany({ where: { name: { in: ["D1", "D2"] } } });
    expect(made.map((r) => r.workspaceId)).toEqual(["clogent", "clogent"]);
    await expect(s.brand.create({ data: { name: "Y", workspaceId: "other" } })).rejects.toThrow(/workspace/i);
    await expect(s.brand.update({ where: { id: clogent.brand }, data: { workspaceId: "other" } })).rejects.toThrow(/workspace/i);
    await expect(s.brand.update({ where: { id: clogent.brand }, data: { workspace: { connect: { id: "other" } } } })).rejects.toThrow(/workspace/i);
    // The database has no default: an unscoped insert that names no workspace fails.
    await expect(db.raw.brand.create({ data: { name: "NoWorkspace" } })).rejects.toThrow();
    expect(await db.raw.brand.findFirst({ where: { name: "Y" } })).toBeNull();
  });

  it("names are unique per workspace", async () => {
    const s = makeScoped(db.raw, "clogent");
    expect(await db.raw.brand.count({ where: { name: "Main" } })).toBe(2);
    await expect(s.brand.create({ data: { name: "Main" } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("interactive transactions stay scoped", async () => {
    const users = await makeScoped(db.raw, "clogent").$transaction(async (tx) => tx.user.findMany());
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => u.workspaceId === "clogent")).toBe(true);
  });

  it("the test helper's prisma is scoped to clogent and scopedDb is memoised", async () => {
    expect(db.workspaceId).toBe("clogent");
    expect((await db.prisma.user.findMany()).map((u) => u.id)).toEqual([clogent.user]);
    expect(scopedDb("clogent")).toBe(scopedDb("clogent"));
    expect(scopedDb("clogent")).not.toBe(scopedDb("other"));
  });
});
