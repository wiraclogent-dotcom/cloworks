import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { AdminError, type Actor } from "@/lib/admin";
import { makeScoped } from "@/lib/db";
import { hashToken } from "@/lib/joinTokens";
import { mergePreview, mergeUsers, USER_FK_HANDLED, type MergeCounts } from "@/lib/mergeUsers";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let admin: Actor;
let n = 0;
const uniq = (p: string) => `${p}${++n}`;
const DAY = 24 * 3_600_000;
let base: { brandId: string; divisionId: string; typeId: string };
let categoryId: string;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AdminError) return e.code;
    throw e;
  }
  return "OK";
};

/** A roster person with a unique name; no login unless `extra` gives one. */
async function person(extra: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const name = uniq("Person");
  return db.prisma.user.create({ data: { name, fullName: `${name} Full`, ...extra } });
}

async function newRequest(requesterId: string, assigneeId: string | null = null) {
  return db.prisma.request.create({ data: { title: "x", ...base, requesterId, assigneeId } });
}

/** One row of every relation to User, all pointing at `userId`. */
async function seedEverything(userId: string) {
  const p = db.prisma;
  const req = await newRequest(userId, userId);
  await p.statusEvent.create({ data: { requestId: req.id, to: "ON_PROGRESS", actorId: userId } });
  await p.deadlineEvent.create({ data: { requestId: req.id, to: new Date(), actorId: userId } });
  await p.comment.create({ data: { requestId: req.id, authorId: userId, body: "hi" } });
  await p.attachment.create({ data: { requestId: req.id, uploaderId: userId, name: "f", url: "https://x.test/f" } });
  await p.kpiTarget.create({ data: { userId, month: "2026-10", role: "DESIGNER", targetTasks: 3 } });
  await p.notification.create({ data: { userId, requestId: req.id, type: "COMMENT", message: "m" } });
  await p.chatRead.create({ data: { userId, requestId: req.id, lastReadAt: new Date() } });
  const project = await p.project.create({ data: { title: "P", ownerId: userId } });
  await p.projectTask.create({ data: { projectId: project.id, position: 0, title: "T", ownerId: userId } });
  await p.libraryItem.create({ data: { title: "L", url: "https://x.test/l", categoryId, createdById: userId, updatedById: userId } });
  const inv = { appRole: "REQUESTER" as const, jobRole: "OTHER" as const, expiresAt: new Date(Date.now() + DAY) };
  await p.invite.create({ data: { ...inv, email: `${uniq("s")}@gmail.com`, tokenHash: hashToken(uniq("t")), invitedById: userId } });
  await p.invite.create({ data: { ...inv, email: `${uniq("f")}@gmail.com`, tokenHash: hashToken(uniq("t")), invitedById: admin.id, userId } });
  return req;
}

const SEEDED: MergeCounts = {
  requested: 1, assigned: 1, statusEvents: 1, deadlineEvents: 1, comments: 1, attachments: 1, kpiTargets: 1,
  notifications: 1, chatReads: 1, ownedProjects: 1, projectTasks: 1, libraryItems: 1, invites: 2,
};
const ZERO = Object.fromEntries(Object.keys(SEEDED).map((k) => [k, 0])) as MergeCounts;

/** Independent count of every relation row pointing at `id` (rows, so a row with two FKs counts once). */
async function countsFor(id: string): Promise<MergeCounts> {
  const p = db.raw;
  return {
    requested: await p.request.count({ where: { requesterId: id } }),
    assigned: await p.request.count({ where: { assigneeId: id } }),
    statusEvents: await p.statusEvent.count({ where: { actorId: id } }),
    deadlineEvents: await p.deadlineEvent.count({ where: { actorId: id } }),
    comments: await p.comment.count({ where: { authorId: id } }),
    attachments: await p.attachment.count({ where: { uploaderId: id } }),
    kpiTargets: await p.kpiTarget.count({ where: { userId: id } }),
    notifications: await p.notification.count({ where: { userId: id } }),
    chatReads: await p.chatRead.count({ where: { userId: id } }),
    ownedProjects: await p.project.count({ where: { ownerId: id } }),
    projectTasks: await p.projectTask.count({ where: { ownerId: id } }),
    libraryItems: await p.libraryItem.count({ where: { OR: [{ createdById: id }, { updatedById: id }] } }),
    invites: await p.invite.count({ where: { OR: [{ invitedById: id }, { userId: id }] } }),
  };
}

beforeAll(async () => {
  db = await createTestDb();
  const a = await db.prisma.user.create({ data: { name: "Wira", fullName: "Wira Budi", email: "wira@clogent.co.id", appRole: "ADMIN" } });
  admin = { id: a.id, appRole: "ADMIN", workspaceId: "clogent" };
  const brand = await db.prisma.brand.create({ data: { name: "B" } });
  const division = await db.prisma.division.create({ data: { name: "D" } });
  const type = await db.prisma.requestType.create({ data: { name: "T" } });
  base = { brandId: brand.id, divisionId: division.id, typeId: type.id };
  categoryId = (await db.prisma.libraryCategory.create({ data: { name: "C" } })).id;
});
afterAll(async () => {
  await db?.stop();
});

describe("mergeUsers", () => {
  it("moves every relation to the survivor and deletes the duplicate", async () => {
    const from = await person();
    const into = await person();
    await seedEverything(from.id);
    expect(await countsFor(from.id)).toEqual(SEEDED);
    expect(await countsFor(into.id)).toEqual(ZERO);

    const r = await mergeUsers(db.prisma, admin, from.id, into.id);
    expect(r).toEqual({ intoId: into.id, intoName: into.name });
    expect(await countsFor(from.id)).toEqual(ZERO);
    expect(await countsFor(into.id)).toEqual(SEEDED);
    expect(await db.raw.user.findUnique({ where: { id: from.id } })).toBeNull();
    // The survivor keeps its own identity.
    const after = await db.raw.user.findUniqueOrThrow({ where: { id: into.id } });
    expect(after).toMatchObject({ name: into.name, fullName: into.fullName, appRole: into.appRole, jobRole: into.jobRole });
  });

  it("keeps the survivor's KPI target for a clashing month", async () => {
    const from = await person();
    const into = await person();
    await db.prisma.kpiTarget.create({ data: { userId: into.id, month: "2026-10", role: "DESIGNER", targetTasks: 5 } });
    await db.prisma.kpiTarget.create({ data: { userId: from.id, month: "2026-10", role: "DESIGNER", targetTasks: 9 } });
    await db.prisma.kpiTarget.create({ data: { userId: from.id, month: "2026-11", role: "DESIGNER", targetTasks: 7 } });
    await mergeUsers(db.prisma, admin, from.id, into.id);
    const rows = await db.raw.kpiTarget.findMany({ where: { userId: into.id }, orderBy: { month: "asc" } });
    expect(rows.map((r) => [r.month, r.targetTasks])).toEqual([["2026-10", 5], ["2026-11", 7]]);
  });

  it("keeps the later chat read for a clashing request", async () => {
    const T1 = new Date("2026-10-01T00:00:00Z");
    const T2 = new Date("2026-10-02T00:00:00Z");
    for (const [intoAt, fromAt, want] of [[T1, T2, T2], [T2, T1, T2]] as const) {
      const from = await person();
      const into = await person();
      const req = await newRequest(admin.id);
      const only = await newRequest(admin.id);
      await db.prisma.chatRead.create({ data: { userId: into.id, requestId: req.id, lastReadAt: intoAt } });
      await db.prisma.chatRead.create({ data: { userId: from.id, requestId: req.id, lastReadAt: fromAt } });
      await db.prisma.chatRead.create({ data: { userId: from.id, requestId: only.id, lastReadAt: T1 } });
      await mergeUsers(db.prisma, admin, from.id, into.id);
      const rows = await db.raw.chatRead.findMany({ where: { userId: into.id } });
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.requestId === req.id)!.lastReadAt).toEqual(want);
      expect(rows.find((r) => r.requestId === only.id)!.lastReadAt).toEqual(T1);
    }
  });

  it("moves the login when the survivor has none", async () => {
    const email = `${uniq("yosi")}@clogent.co.id`;
    const from = await person({ email, passwordHash: "hash-x", mustChangePassword: true, active: true, failedLogins: 2 });
    const into = await person({ active: false, passwordVersion: 0 });
    const r = await mergeUsers(db.prisma, admin, from.id, into.id);
    expect(r).toEqual({ intoId: into.id, intoName: into.name });
    expect(await db.raw.user.findUnique({ where: { id: from.id } })).toBeNull();
    const after = await db.raw.user.findUniqueOrThrow({ where: { id: into.id } });
    expect(after).toMatchObject({ email, passwordHash: "hash-x", mustChangePassword: true, active: true, passwordVersion: 1, failedLogins: 0, lockedUntil: null });
  });

  it("keeps the survivor's login fields when it already has a login", async () => {
    const from = await person({ active: true });
    const email = `${uniq("keep")}@clogent.co.id`;
    const into = await person({ email, passwordHash: "mine", passwordVersion: 3 });
    await mergeUsers(db.prisma, admin, from.id, into.id);
    expect(await db.raw.user.findUniqueOrThrow({ where: { id: into.id } })).toMatchObject({ email, passwordHash: "mine", passwordVersion: 3 });
  });

  it("copies the duplicate's avatar only when the survivor has none", async () => {
    const at = new Date("2026-10-05T00:00:00Z");
    const from = await person({ avatar: Buffer.from([1, 2, 3]), avatarType: "image/png", avatarUpdatedAt: at });
    const into = await person();
    await mergeUsers(db.prisma, admin, from.id, into.id);
    const after = await db.raw.user.findUniqueOrThrow({ where: { id: into.id } });
    expect(Buffer.from(after.avatar!)).toEqual(Buffer.from([1, 2, 3]));
    expect(after).toMatchObject({ avatarType: "image/png", avatarUpdatedAt: at });
  });

  it("does not overwrite the survivor's avatar", async () => {
    const from = await person({ avatar: Buffer.from([1, 2, 3]), avatarType: "image/png", avatarUpdatedAt: new Date() });
    const at = new Date("2026-09-01T00:00:00Z");
    const into = await person({ avatar: Buffer.from([9, 9]), avatarType: "image/jpeg", avatarUpdatedAt: at });
    await mergeUsers(db.prisma, admin, from.id, into.id);
    const after = await db.raw.user.findUniqueOrThrow({ where: { id: into.id } });
    expect(Buffer.from(after.avatar!)).toEqual(Buffer.from([9, 9]));
    expect(after).toMatchObject({ avatarType: "image/jpeg", avatarUpdatedAt: at });
  });

  it("adds the duplicate's names to aliases, skipping ones that collide", async () => {
    const from = await db.prisma.user.create({ data: { name: "Yosiananda", fullName: "Yosiananda Kurnia", aliases: ["Yosi", "Into Alias"] } });
    const into = await db.prisma.user.create({ data: { name: "Yosi K", fullName: "Yosiananda K", aliases: ["Into Alias"] } });
    await db.prisma.user.create({ data: { name: "Kurnia Two", fullName: "Kurnia Two" } });
    await db.prisma.user.create({ data: { name: "Someone", fullName: "Someone Else", aliases: ["yosiananda-kurnia"] } });
    await mergeUsers(db.prisma, admin, from.id, into.id);
    const after = await db.raw.user.findUniqueOrThrow({ where: { id: into.id } });
    expect(after.aliases).toEqual(["Into Alias", "Yosiananda", "Yosi"]);
    expect(after.aliases).not.toContain("Yosiananda Kurnia");
  });

  it("skips the survivor's own names and caps aliases at 20", async () => {
    const own = Array.from({ length: 19 }, (_, i) => `Own Alias ${i}`);
    const from = await db.prisma.user.create({ data: { name: uniq("Twin"), fullName: "Survivor Full Name", aliases: ["extra one", "extra two"] } });
    const into = await db.prisma.user.create({ data: { name: uniq("Surv"), fullName: "Survivor Full Name", aliases: own } });
    await mergeUsers(db.prisma, admin, from.id, into.id);
    const after = await db.raw.user.findUniqueOrThrow({ where: { id: into.id } });
    expect(after.aliases).toEqual([...own, from.name]);
  });

  it("repoints an open invite linked to the duplicate", async () => {
    const from = await person();
    const into = await person();
    const inv = await db.prisma.invite.create({
      data: { email: `${uniq("open")}@gmail.com`, appRole: "CREATIVE", jobRole: "DESIGNER", tokenHash: hashToken(uniq("t")), invitedById: admin.id, expiresAt: new Date(Date.now() + DAY), userId: from.id },
    });
    await mergeUsers(db.prisma, admin, from.id, into.id);
    expect((await db.raw.invite.findUniqueOrThrow({ where: { id: inv.id } })).userId).toBe(into.id);
  });

  it("rewrites mentions of the duplicate", async () => {
    const from = await person();
    const into = await person();
    const req = await newRequest(admin.id);
    const only = await db.prisma.comment.create({ data: { requestId: req.id, authorId: admin.id, body: "a", mentions: [from.id] } });
    const both = await db.prisma.comment.create({ data: { requestId: req.id, authorId: admin.id, body: "b", mentions: [into.id, admin.id, from.id] } });
    const mixed = await db.prisma.comment.create({ data: { requestId: req.id, authorId: admin.id, body: "c", mentions: [admin.id, from.id, into.id] } });
    const none = await db.prisma.comment.create({ data: { requestId: req.id, authorId: admin.id, body: "d", mentions: [admin.id] } });
    await mergeUsers(db.prisma, admin, from.id, into.id);
    const m = async (id: string) => (await db.raw.comment.findUniqueOrThrow({ where: { id } })).mentions;
    expect(await m(only.id)).toEqual([into.id]);
    expect(await m(both.id)).toEqual([into.id, admin.id]);
    expect(await m(mixed.id)).toEqual([admin.id, into.id]);
    expect(await m(none.id)).toEqual([admin.id]);
  });

  describe("guards", () => {
    /** Runs `op` and checks it fails with `want` and that both people and every row of `from` are untouched. */
    async function refused(want: string, fromId: string, intoId: string, op: () => Promise<unknown>) {
      const before = [await countsFor(fromId), await db.raw.user.findUnique({ where: { id: fromId } }), await db.raw.user.findUnique({ where: { id: intoId } })];
      expect(await code(op())).toBe(want);
      const after = [await countsFor(fromId), await db.raw.user.findUnique({ where: { id: fromId } }), await db.raw.user.findUnique({ where: { id: intoId } })];
      expect(after).toEqual(before);
    }

    it("refuses merging a person into themself", async () => {
      const u = await person();
      await seedEverything(u.id);
      await refused("VALIDATION", u.id, u.id, () => mergeUsers(db.prisma, admin, u.id, u.id));
      expect(await code(mergePreview(db.prisma, admin, u.id, u.id))).toBe("VALIDATION");
    });

    it("refuses merging away the actor's own account", async () => {
      const into = await person();
      await refused("VALIDATION", admin.id, into.id, () => mergeUsers(db.prisma, admin, admin.id, into.id));
    });

    it("refuses unknown people and people in another workspace", async () => {
      const u = await person();
      await seedEverything(u.id);
      await refused("NOT_FOUND", u.id, "nope", () => mergeUsers(db.prisma, admin, u.id, "nope"));
      await refused("NOT_FOUND", u.id, "nope", () => mergeUsers(db.prisma, admin, "nope", u.id));
      const ws = await db.raw.workspace.create({ data: { name: "Elsewhere", slug: uniq("elsewhere") } });
      const stranger = await makeScoped(db.raw, ws.id).user.create({ data: { name: "Stranger", fullName: "Stranger" } });
      await refused("NOT_FOUND", u.id, stranger.id, () => mergeUsers(db.prisma, admin, u.id, stranger.id));
      await refused("NOT_FOUND", stranger.id, u.id, () => mergeUsers(db.prisma, admin, stranger.id, u.id));
      expect(await code(mergePreview(db.prisma, admin, u.id, "nope"))).toBe("NOT_FOUND");
    });

    it("refuses when both people have a login", async () => {
      const from = await person({ email: `${uniq("A")}@Clogent.co.id`.toUpperCase() });
      const into = await person({ email: `${uniq("b")}@clogent.co.id` });
      await seedEverything(from.id);
      await refused("CONFLICT", from.id, into.id, () => mergeUsers(db.prisma, admin, from.id, into.id));
      await expect(mergeUsers(db.prisma, admin, from.id, into.id)).rejects.toThrow("Both people have a login. Clear one login email first.");
      await expect(mergePreview(db.prisma, admin, from.id, into.id)).rejects.toThrow("Both people have a login. Clear one login email first.");
    });

    it("refuses non-admins", async () => {
      const from = await person();
      const into = await person();
      await seedEverything(from.id);
      for (const appRole of ["REQUESTER", "CREATIVE", "LEAD"] as const) {
        const a: Actor = { ...admin, appRole };
        await refused("FORBIDDEN", from.id, into.id, () => mergeUsers(db.prisma, a, from.id, into.id));
        expect(await code(mergePreview(db.prisma, a, from.id, into.id))).toBe("FORBIDDEN");
      }
    });

    it("refuses to leave no admin who can sign in", async () => {
      const ws = await db.raw.workspace.create({ data: { name: "Other", slug: uniq("other") } });
      const scoped = makeScoped(db.raw, ws.id);
      const from = await scoped.user.create({ data: { name: "Boss", fullName: "Boss", appRole: "ADMIN", email: `${uniq("boss")}@other.test`, passwordHash: "h" } });
      const into = await scoped.user.create({ data: { name: "Req", fullName: "Req", appRole: "REQUESTER" } });
      const helper = await scoped.user.create({ data: { name: "Helper", fullName: "Helper", appRole: "ADMIN" } });
      const actor: Actor = { id: helper.id, appRole: "ADMIN", workspaceId: ws.id };
      await refused("LAST_ADMIN", from.id, into.id, () => mergeUsers(scoped, actor, from.id, into.id));
      expect(await code(mergePreview(scoped, actor, from.id, into.id))).toBe("LAST_ADMIN");
    });
  });

  it("preview reports counts and writes nothing", async () => {
    const from = await person({ email: `${uniq("prev")}@clogent.co.id`, appRole: "ADMIN", jobRole: "OTHER" });
    const into = await person({ appRole: "CREATIVE", jobRole: "DESIGNER" });
    await seedEverything(from.id);
    const p = await mergePreview(db.prisma, admin, from.id, into.id);
    expect(p).toEqual({
      from: { id: from.id, name: from.name, email: from.email, appRole: from.appRole, jobRole: from.jobRole },
      into: { id: into.id, name: into.name, email: null, active: true, appRole: into.appRole, jobRole: into.jobRole },
      counts: SEEDED,
      movesLogin: true,
    });
    expect([p.from.appRole, p.from.jobRole, p.into.appRole, p.into.jobRole]).toEqual(["ADMIN", "OTHER", "CREATIVE", "DESIGNER"]);
    expect(await countsFor(from.id)).toEqual(SEEDED);
    expect(await countsFor(into.id)).toEqual(ZERO);
    expect(await db.raw.user.findUnique({ where: { id: from.id } })).not.toBeNull();
    expect((await mergePreview(db.prisma, admin, into.id, from.id)).movesLogin).toBe(false);
  });

  it("handles every User foreign key", () => {
    const fks: string[] = [];
    for (const m of Prisma.dmmf.datamodel.models) {
      if (m.name === "User") continue;
      for (const f of m.fields) if (f.kind === "object" && f.type === "User" && f.relationFromFields?.length) fks.push(`${m.name}.${f.relationFromFields[0]}`);
    }
    expect([...USER_FK_HANDLED].sort()).toEqual(fks.sort());
  });
});
