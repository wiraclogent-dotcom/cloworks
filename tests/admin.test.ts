import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { AppRole } from "@prisma/client";
import {
  AdminError, updateUser, createUser, setUserLoginEmail, setUserPassword, assertMayAddLogin,
  createBrand, renameBrand, createDivision, renameDivision, upsertRequestType,
} from "@/lib/admin";
import { loadActiveUser, requireUserWith } from "@/lib/session-core";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let admin: { id: string; appRole: AppRole; workspaceId: string };
let n = 0;
const uniq = (p: string) => `${p}${++n}`;
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AdminError) return e.code;
    throw e;
  }
  return "OK";
};
const mk = (over: Record<string, unknown> = {}) => {
  const name = uniq("U");
  return db.prisma.user.create({ data: { name, fullName: name, email: `${name.toLowerCase()}@clogent.co.id`, appRole: "REQUESTER", ...over } });
};

beforeAll(async () => {
  db = await createTestDb();
  const a = await mk({ appRole: "ADMIN" });
  admin = { id: a.id, appRole: "ADMIN", workspaceId: "clogent" };
});
afterAll(async () => {
  await db?.stop();
});

describe("FORBIDDEN for non-admins on every core", () => {
  for (const role of ["REQUESTER", "CREATIVE", "LEAD"] as AppRole[]) {
    it(role, async () => {
      const a = { id: "x", appRole: role, workspaceId: "clogent" };
      const p = db.prisma;
      const u = await mk();
      const calls: Promise<unknown>[] = [
        updateUser(p, a, u.id, { active: false }),
        createUser(p, a, { name: uniq("N"), jobRole: "OTHER", appRole: "REQUESTER" }),
        setUserLoginEmail(p, a, u.id, "a@gmail.com"),
        createBrand(p, a, uniq("B")),
        renameBrand(p, a, "x", "y"),
        createDivision(p, a, uniq("D")),
        renameDivision(p, a, "x", "y"),
        upsertRequestType(p, a, { name: uniq("T"), fieldSchema: [], active: true }),
      ];
      for (const c of calls) expect(await code(c)).toBe("FORBIDDEN");
      expect((await p.user.findUnique({ where: { id: u.id } }))?.active).toBe(true);
    });
  }
});

describe("updateUser", () => {
  it("changes roles; undefined keeps, explicit replaces", async () => {
    const u = await mk({ jobRole: "DESIGNER", title: "T1", aliases: ["keep"] });
    const r = await updateUser(db.prisma, admin, u.id, { appRole: "LEAD" });
    expect(r.appRole).toBe("LEAD");
    expect(r.jobRole).toBe("DESIGNER");
    expect(r.title).toBe("T1");
    expect(r.aliases).toEqual(["keep"]);
    const r2 = await updateUser(db.prisma, admin, u.id, { title: null, jobRole: "OTHER", aliases: [] });
    expect(r2.title).toBeNull();
    expect(r2.jobRole).toBe("OTHER");
    expect(r2.aliases).toEqual([]);
    expect(r2.appRole).toBe("LEAD");
  });
  it("trims and dedupes aliases case-insensitively; enforces limits", async () => {
    const u = await mk();
    const r = await updateUser(db.prisma, admin, u.id, { aliases: [" Rina  P ", "rina p", "RINA P", "x"] });
    expect(r.aliases).toEqual(["Rina P", "x"]);
    expect(await code(updateUser(db.prisma, admin, u.id, { aliases: [""] }))).toBe("VALIDATION");
    expect(await code(updateUser(db.prisma, admin, u.id, { aliases: ["a".repeat(51)] }))).toBe("VALIDATION");
    expect(await code(updateUser(db.prisma, admin, u.id, { aliases: Array.from({ length: 21 }, (_, i) => `al${i}`) }))).toBe("VALIDATION");
  });
  it("rejects alias colliding with another user's name or alias, naming them", async () => {
    const a = await mk({ aliases: ["Shared"] });
    const b = await mk();
    await expect(updateUser(db.prisma, admin, b.id, { aliases: ["shared"] })).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining(a.name) });
    await expect(updateUser(db.prisma, admin, b.id, { aliases: [a.name.toUpperCase()] })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await code(updateUser(db.prisma, admin, a.id, { aliases: ["Shared", "more"] }))).toBe("OK");
  });
  it("NOT_FOUND", async () => {
    expect(await code(updateUser(db.prisma, admin, "nope", { active: false }))).toBe("NOT_FOUND");
  });
  it("deactivating keeps the row and its history", async () => {
    const u = await mk();
    await updateUser(db.prisma, admin, u.id, { active: false });
    expect((await db.prisma.user.findUnique({ where: { id: u.id } }))?.active).toBe(false);
  });
});

describe("last admin protection", () => {
  it("cannot demote or deactivate the only active admin (also themselves)", async () => {
    const d = await createTestDb();
    try {
      const a = await d.prisma.user.create({ data: { name: "Solo", fullName: "Solo", email: "solo@clogent.co.id", appRole: "ADMIN" } });
      await d.prisma.user.create({ data: { name: "Inactive", fullName: "Inactive", email: "i@clogent.co.id", appRole: "ADMIN", active: false } });
      const act = { id: a.id, appRole: "ADMIN" as const, workspaceId: "clogent" };
      expect(await code(updateUser(d.prisma, act, a.id, { appRole: "LEAD" }))).toBe("LAST_ADMIN");
      expect(await code(updateUser(d.prisma, act, a.id, { active: false }))).toBe("LAST_ADMIN");
      expect(await code(updateUser(d.prisma, act, a.id, { appRole: "LEAD", active: false }))).toBe("LAST_ADMIN");
      expect(await code(updateUser(d.prisma, act, a.id, { jobRole: "DESIGNER", appRole: "ADMIN" }))).toBe("OK");
      const second = await d.prisma.user.create({ data: { name: "Two", fullName: "Two", email: "two@clogent.co.id", appRole: "ADMIN" } });
      expect(await code(updateUser(d.prisma, act, a.id, { appRole: "LEAD" }))).toBe("OK");
      expect((await d.prisma.user.findUnique({ where: { id: second.id } }))?.appRole).toBe("ADMIN");
    } finally {
      await d.stop();
    }
  });
  it("concurrent demotion of both admins leaves at least one", async () => {
    const d = await createTestDb();
    try {
      const a = await d.prisma.user.create({ data: { name: "A", fullName: "A", email: "a@clogent.co.id", appRole: "ADMIN" } });
      const b = await d.prisma.user.create({ data: { name: "B", fullName: "B", email: "b@clogent.co.id", appRole: "ADMIN" } });
      const act = { id: a.id, appRole: "ADMIN" as const, workspaceId: "clogent" };
      for (let i = 0; i < 3; i++) {
        const res = await Promise.allSettled([
          updateUser(d.prisma, act, a.id, { appRole: "LEAD" }),
          updateUser(d.prisma, act, b.id, { active: false }),
        ]);
        expect(res.filter((r) => r.status === "fulfilled").length).toBe(1);
        expect(await d.prisma.user.count({ where: { appRole: "ADMIN", active: true } })).toBe(1);
        await d.prisma.user.updateMany({ data: { appRole: "ADMIN", active: true } });
      }
    } finally {
      await d.stop();
    }
  });
});

describe("createUser", () => {
  it("creates a roster record without an email", async () => {
    const name = uniq("Roster");
    const u = await createUser(db.prisma, admin, { name: `  ${name} `, title: "Designer", jobRole: "DESIGNER", appRole: "CREATIVE", aliases: ["rr", "RR"] });
    expect(u.email).toBeNull();
    expect(u.name).toBe(name);
    expect(u.fullName).toBe(name);
    expect(u.aliases).toEqual(["rr"]);
    expect(u.active).toBe(true);
  });
  it("name must be unique case-insensitively (also vs aliases) and non-empty", async () => {
    const u = await mk({ aliases: ["Zed Alias"] });
    expect(await code(createUser(db.prisma, admin, { name: u.name.toLowerCase(), jobRole: "OTHER", appRole: "REQUESTER" }))).toBe("CONFLICT");
    expect(await code(createUser(db.prisma, admin, { name: "zed alias", jobRole: "OTHER", appRole: "REQUESTER" }))).toBe("CONFLICT");
    expect(await code(createUser(db.prisma, admin, { name: uniq("Q"), aliases: [u.name], jobRole: "OTHER", appRole: "REQUESTER" }))).toBe("CONFLICT");
    expect(await code(createUser(db.prisma, admin, { name: "   ", jobRole: "OTHER", appRole: "REQUESTER" }))).toBe("VALIDATION");
  });
});

describe("setUserLoginEmail", () => {
  const sess = (id: string, loginEmail?: string) => async () => ({ user: { id, loginEmail } });
  it("any domain binds and enables login with no extra access row", async () => {
    const u = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, u.id, "  Fadli.Test@Gmail.com ");
    expect((await db.prisma.user.findUnique({ where: { id: u.id } }))?.email).toBe("fadli.test@gmail.com");
    expect((await requireUserWith(sess(u.id, "fadli.test@gmail.com"), db.prisma)).id).toBe(u.id);

    const c = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, c.id, "Someone@CLOGENT.co.id");
    expect((await requireUserWith(sess(c.id, "someone@clogent.co.id"), db.prisma)).id).toBe(c.id);
  });
  it("loadActiveUser returns workspaceId and mustChangePassword", async () => {
    const u = await mk({ email: "wf@clogent.co.id" });
    expect(await loadActiveUser(db.prisma, u.id)).toMatchObject({ workspaceId: "clogent", mustChangePassword: false });
    await db.raw.user.update({ where: { id: u.id }, data: { mustChangePassword: true } });
    expect((await loadActiveUser(db.prisma, u.id))?.mustChangePassword).toBe(true);
  });
  it("changing the email ends sessions bound to the old one", async () => {
    const u = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, u.id, "old1@gmail.com");
    expect((await requireUserWith(sess(u.id, "old1@gmail.com"), db.prisma)).id).toBe(u.id);
    await setUserLoginEmail(db.prisma, admin, u.id, "new1@gmail.com");
    await expect(requireUserWith(sess(u.id, "old1@gmail.com"), db.prisma)).rejects.toThrow();
    expect((await requireUserWith(sess(u.id, "new1@gmail.com"), db.prisma)).id).toBe(u.id);
  });
  it("conflict when another user has it; user keeps their email", async () => {
    const a = await mk({ email: "taken@gmail.com" });
    const b = await mk({ email: null });
    await expect(setUserLoginEmail(db.prisma, admin, b.id, "TAKEN@gmail.com")).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining(a.name) });
    expect((await db.prisma.user.findUnique({ where: { id: b.id } }))?.email).toBeNull();
  });
  it("null clears the email and revokes access", async () => {
    const u = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, u.id, "gone@gmail.com");
    await setUserLoginEmail(db.prisma, admin, u.id, null);
    expect((await db.prisma.user.findUnique({ where: { id: u.id } }))?.email).toBeNull();
    await expect(requireUserWith(sess(u.id, "gone@gmail.com"), db.prisma)).rejects.toThrow();
  });
  it("rejects invalid shapes", async () => {
    const u = await mk({ email: null });
    for (const bad of ["a@b@c", "a b@c.com", "", "   ", "nodomain", "@x.com", "x@", `${"a".repeat(250)}@x.com`])
      expect(await code(setUserLoginEmail(db.prisma, admin, u.id, bad))).toBe("VALIDATION");
    expect((await db.prisma.user.findUnique({ where: { id: u.id } }))?.email).toBeNull();
  });
  it("NOT_FOUND", async () => {
    expect(await code(setUserLoginEmail(db.prisma, admin, "nope", "a@gmail.com"))).toBe("NOT_FOUND");
  });
});

describe("platform-admin addresses are reserved (PLATFORM_ADMIN_EMAILS)", () => {
  const BOSS = "boss@clowork.test";
  const OTHER_BOSS = "other.boss@clowork.test";
  const PW = "another-password-1";
  const asActor = (u: { id: string }) => ({ id: u.id, appRole: "ADMIN" as AppRole, workspaceId: "clogent" });
  const emailOf = async (id: string) => (await db.prisma.user.findUnique({ where: { id } }))?.email;
  const hashOf = async (id: string) => (await db.prisma.user.findUnique({ where: { id } }))?.passwordHash ?? null;
  let boss: { id: string };
  beforeEach(async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", ` ${BOSS.toUpperCase()} , ${OTHER_BOSS}`);
    // The platform admin is a workspace admin too; clear any earlier test's row holding the address first.
    await db.raw.user.updateMany({ where: { email: { in: [BOSS, OTHER_BOSS] } }, data: { email: null } });
    boss = await mk({ appRole: "ADMIN", email: BOSS });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("a workspace admin cannot bind a reserved address (any case) to someone, nor to themselves", async () => {
    const u = await mk({ email: null });
    for (const e of [OTHER_BOSS, " Other.Boss@Clowork.TEST "])
      await expect(setUserLoginEmail(db.prisma, admin, u.id, e)).rejects.toMatchObject({ code: "FORBIDDEN", message: "That email is reserved." });
    expect(await emailOf(u.id)).toBeNull();
    const before = await emailOf(admin.id);
    expect(await code(setUserLoginEmail(db.prisma, admin, admin.id, OTHER_BOSS))).toBe("FORBIDDEN");
    expect(await emailOf(admin.id)).toBe(before);
  });

  it("a workspace admin cannot change, clear or set the password of a platform admin's row", async () => {
    const hash = await hashOf(boss.id);
    await expect(setUserLoginEmail(db.prisma, admin, boss.id, "mine@gmail.com")).rejects.toMatchObject({ code: "FORBIDDEN", message: "You can't change this person's sign-in." });
    expect(await code(setUserLoginEmail(db.prisma, admin, boss.id, null))).toBe("FORBIDDEN");
    expect(await emailOf(boss.id)).toBe(BOSS);
    await expect(setUserPassword(db.prisma, admin, boss.id, PW)).rejects.toMatchObject({ code: "FORBIDDEN", message: "You can't change this person's sign-in." });
    expect(await hashOf(boss.id)).toBe(hash);
  });

  it("another platform admin cannot take over a platform admin's row either, but may bind a reserved address", async () => {
    const other = await mk({ appRole: "ADMIN", email: null });
    expect(await code(setUserPassword(db.prisma, asActor(boss), other.id, PW))).toBe("VALIDATION"); // no email yet
    await setUserLoginEmail(db.prisma, asActor(boss), other.id, OTHER_BOSS);
    expect(await emailOf(other.id)).toBe(OTHER_BOSS);
    expect(await code(setUserPassword(db.prisma, asActor(boss), other.id, PW))).toBe("FORBIDDEN");
    expect(await code(setUserLoginEmail(db.prisma, asActor(boss), other.id, "elsewhere@gmail.com"))).toBe("FORBIDDEN");
  });

  it("a platform admin can still set their own password and change their own email", async () => {
    await setUserPassword(db.prisma, asActor(boss), boss.id, PW);
    expect(await hashOf(boss.id)).toBeTruthy();
    await setUserLoginEmail(db.prisma, asActor(boss), boss.id, " Boss@Clowork.test ");
    expect(await emailOf(boss.id)).toBe(BOSS);
    await setUserLoginEmail(db.prisma, asActor(boss), boss.id, "boss.personal@gmail.com");
    expect(await emailOf(boss.id)).toBe("boss.personal@gmail.com");
  });

  it("ordinary addresses and rows are unaffected", async () => {
    const u = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, u.id, "plain.person@gmail.com");
    await setUserPassword(db.prisma, admin, u.id, PW);
    expect(await emailOf(u.id)).toBe("plain.person@gmail.com");
    expect(await hashOf(u.id)).toBeTruthy();
    await assertMayAddLogin(db.prisma, admin, "plain.person2@gmail.com", true);
  });

  it("assertMayAddLogin (Add person): a reserved address needs a platform-admin actor and never takes a typed password", async () => {
    expect(await code(assertMayAddLogin(db.prisma, admin, OTHER_BOSS, false))).toBe("FORBIDDEN");
    expect(await code(assertMayAddLogin(db.prisma, asActor(boss), OTHER_BOSS, false))).toBe("OK");
    expect(await code(assertMayAddLogin(db.prisma, asActor(boss), OTHER_BOSS, true))).toBe("FORBIDDEN");
  });

  it("with PLATFORM_ADMIN_EMAILS unset nothing is reserved", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", undefined);
    await setUserPassword(db.prisma, admin, boss.id, PW);
    await setUserLoginEmail(db.prisma, admin, boss.id, "was.boss@gmail.com");
    expect(await emailOf(boss.id)).toBe("was.boss@gmail.com");
    const u = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, u.id, OTHER_BOSS);
    expect(await emailOf(u.id)).toBe(OTHER_BOSS);
    expect(await code(assertMayAddLogin(db.prisma, admin, BOSS, true))).toBe("OK");
  });
});

describe("brands and divisions", () => {
  it("create trims, unique case-insensitively; rename; no self-conflict on case change", async () => {
    const name = uniq("Brand");
    const b = await createBrand(db.prisma, admin, `  ${name} `);
    expect(b.name).toBe(name);
    expect(await code(createBrand(db.prisma, admin, name.toUpperCase()))).toBe("CONFLICT");
    const other = await createBrand(db.prisma, admin, uniq("Brand"));
    expect(await code(renameBrand(db.prisma, admin, other.id, name.toLowerCase()))).toBe("CONFLICT");
    expect((await renameBrand(db.prisma, admin, b.id, name.toUpperCase())).name).toBe(name.toUpperCase());
    expect(await code(renameBrand(db.prisma, admin, "nope", "x"))).toBe("NOT_FOUND");
    expect(await code(createBrand(db.prisma, admin, "  "))).toBe("VALIDATION");
    expect(await code(createBrand(db.prisma, admin, "x".repeat(61)))).toBe("VALIDATION");
  });
  it("same for divisions", async () => {
    const name = uniq("Div");
    const d = await createDivision(db.prisma, admin, name);
    expect(await code(createDivision(db.prisma, admin, name.toLowerCase()))).toBe("CONFLICT");
    expect((await renameDivision(db.prisma, admin, d.id, `${name} 2`)).name).toBe(`${name} 2`);
    expect(await code(renameDivision(db.prisma, admin, "nope", "x"))).toBe("NOT_FOUND");
  });
});

describe("upsertRequestType", () => {
  const good = [{ key: "platform", label: "Platform", type: "select", options: ["TikTok"], required: true }];
  it("creates, updates, deactivates", async () => {
    const name = uniq("Type");
    const t = await upsertRequestType(db.prisma, admin, { name, fieldSchema: good, active: true });
    expect(t.active).toBe(true);
    const t2 = await upsertRequestType(db.prisma, admin, { id: t.id, name: `${name}x`, fieldSchema: [], active: false });
    expect(t2.id).toBe(t.id);
    expect(t2.active).toBe(false);
    expect(t2.fieldSchema).toEqual([]);
  });
  it("invalid schema -> VALIDATION with messages", async () => {
    for (const bad of [{}, [{ key: "", label: "x", type: "text" }], [{ key: "a", label: "A", type: "bogus" }],
      [{ key: "a", label: "A", type: "text" }, { key: "a", label: "B", type: "text" }], [{ key: "s", label: "S", type: "select" }]]) {
      await expect(upsertRequestType(db.prisma, admin, { name: uniq("T"), fieldSchema: bad, active: true })).rejects.toMatchObject({
        code: "VALIDATION", details: expect.any(Array),
      });
    }
  });
  it("duplicate name -> CONFLICT; missing id -> NOT_FOUND", async () => {
    const name = uniq("Type");
    await upsertRequestType(db.prisma, admin, { name, fieldSchema: [], active: true });
    expect(await code(upsertRequestType(db.prisma, admin, { name: name.toUpperCase(), fieldSchema: [], active: true }))).toBe("CONFLICT");
    expect(await code(upsertRequestType(db.prisma, admin, { id: "nope", name: uniq("T"), fieldSchema: [], active: true }))).toBe("NOT_FOUND");
  });
});

describe("sign-in-capable admin guard (email path)", () => {
  async function fresh() {
    const d = await createTestDb();
    const mkA = (name: string, email: string | null, extra: Record<string, unknown> = {}) =>
      d.prisma.user.create({ data: { name, fullName: name, email, appRole: "ADMIN", ...extra } });
    return { d, mkA };
  }
  const emailOf = async (d: TestDb, id: string) => (await d.prisma.user.findUnique({ where: { id } }))?.email;

  it("single Gmail admin: clearing is LAST_ADMIN and changes nothing; re-pointing is allowed", async () => {
    const { d, mkA } = await fresh();
    try {
      const a = await mkA("Gm", "gm@gmail.com");
      const act = { id: a.id, appRole: "ADMIN" as const, workspaceId: "clogent" };
      expect(await code(setUserLoginEmail(d.prisma, act, a.id, null))).toBe("LAST_ADMIN");
      expect(await emailOf(d, a.id)).toBe("gm@gmail.com");
      expect(await code(setUserLoginEmail(d.prisma, act, a.id, "other@yahoo.com.invalid"))).toBe("OK");
      expect(await code(setUserLoginEmail(d.prisma, act, a.id, "gm@gmail.com"))).toBe("OK");
      expect(await emailOf(d, a.id)).toBe("gm@gmail.com");
    } finally {
      await d.stop();
    }
  });
  it("demoting/deactivating: an admin with no email does not count", async () => {
    const { d, mkA } = await fresh();
    try {
      const a = await mkA("Ok", "ok@clogent.co.id");
      await mkA("NoMail", null);
      const act = { id: a.id, appRole: "ADMIN" as const, workspaceId: "clogent" };
      expect(await code(updateUser(d.prisma, act, a.id, { appRole: "LEAD" }))).toBe("LAST_ADMIN");
      expect(await code(updateUser(d.prisma, act, a.id, { active: false }))).toBe("LAST_ADMIN");
    } finally {
      await d.stop();
    }
  });
  it("an active admin with an outside-domain email counts as sign-in capable", async () => {
    const { d, mkA } = await fresh();
    try {
      const a = await mkA("Ok", "ok@clogent.co.id");
      await mkA("Outside", "outside@gmail.com");
      const act = { id: a.id, appRole: "ADMIN" as const, workspaceId: "clogent" };
      expect(await code(updateUser(d.prisma, act, a.id, { appRole: "LEAD" }))).toBe("OK");
    } finally {
      await d.stop();
    }
  });
  it("an inactive admin with an email does not count", async () => {
    const { d, mkA } = await fresh();
    try {
      const a = await mkA("Ok", "ok@clogent.co.id");
      await mkA("Off", "off@gmail.com", { active: false });
      expect(await code(updateUser(d.prisma, { id: a.id, appRole: "ADMIN", workspaceId: "clogent" }, a.id, { appRole: "LEAD" }))).toBe("LAST_ADMIN");
    } finally {
      await d.stop();
    }
  });
  it("with a second sign-in-capable admin clearing the email and demoting are allowed", async () => {
    const { d, mkA } = await fresh();
    try {
      const a = await mkA("Gm", "gm@gmail.com");
      await mkA("Co", "co@clogent.co.id");
      const act = { id: a.id, appRole: "ADMIN" as const, workspaceId: "clogent" };
      expect(await code(setUserLoginEmail(d.prisma, act, a.id, null))).toBe("OK");
      expect(await code(updateUser(d.prisma, act, a.id, { appRole: "LEAD" }))).toBe("OK");
    } finally {
      await d.stop();
    }
  });
  it("concurrent: clearing one admin's email and demoting the other cannot both succeed", async () => {
    const { d, mkA } = await fresh();
    try {
      const g = await mkA("Gm", "gm@gmail.com");
      const c = await mkA("Co", "co@clogent.co.id");
      const act = { id: g.id, appRole: "ADMIN" as const, workspaceId: "clogent" };
      await Promise.allSettled([setUserLoginEmail(d.prisma, act, g.id, null), updateUser(d.prisma, act, c.id, { appRole: "LEAD" })]);
      expect(await d.prisma.user.count({ where: { appRole: "ADMIN", active: true, email: { not: null } } })).toBeGreaterThan(0);
    } finally {
      await d.stop();
    }
  });
});

describe("collisions mirror the import resolver", () => {
  it("fullName vs another user's fullName / name via createUser", async () => {
    const o = await mk({ name: uniq("Rina"), fullName: "Rina Putri Z" });
    await expect(createUser(db.prisma, admin, { name: "Rina Putri Z", jobRole: "OTHER", appRole: "REQUESTER" })).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining(o.name) });
    await expect(createUser(db.prisma, admin, { name: uniq("N"), fullName: "rina-putri z", jobRole: "OTHER", appRole: "REQUESTER" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("punctuation and spacing do not escape the check on aliases", async () => {
    await mk({ aliases: ["Rina Pq"] });
    const b = await mk();
    expect(await code(updateUser(db.prisma, admin, b.id, { aliases: ["Rina P.q"] }))).toBe("CONFLICT");
    expect(await code(updateUser(db.prisma, admin, b.id, { aliases: ["RinaPq"] }))).toBe("CONFLICT");
    expect(await code(updateUser(db.prisma, admin, b.id, { fullName: "rina pq" }))).toBe("CONFLICT");
  });
  it("own fields: alias equal to own name is silently dropped, name == fullName is fine, unrelated passes", async () => {
    const b = await mk();
    expect(await code(updateUser(db.prisma, admin, b.id, { aliases: [b.name.toLowerCase()] }))).toBe("OK");
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: b.id } })).aliases).toEqual([]);
    expect(await code(updateUser(db.prisma, admin, b.id, { aliases: ["totally-unique-alias-xyz"] }))).toBe("OK");
    expect(await code(createUser(db.prisma, admin, { name: uniq("Fresh"), jobRole: "OTHER", appRole: "REQUESTER", aliases: ["fresh-one"] }))).toBe("OK");
  });
});

describe("edit form posts every field: only CHANGED names are collision-checked", () => {
  it("editing a role with a posted alias list containing the person's own name succeeds (seeded Irsyad shape)", async () => {
    const p = await mk({ name: "Irsyad" + uniq("x"), fullName: "Irsyad Ahnaf " + uniq("F"), appRole: "CREATIVE", aliases: ["Irshyad" + n] });
    const posted = [p.name.toLowerCase(), ...p.aliases];
    expect(await code(updateUser(db.prisma, admin, p.id, { appRole: "LEAD", fullName: p.fullName, aliases: posted }))).toBe("OK");
    const after = await db.prisma.user.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.appRole).toBe("LEAD");
    expect(after.aliases).toEqual(p.aliases);
  });
  it("a pre-existing collision does not block an unrelated edit, but a changed colliding alias still fails", async () => {
    const other = await mk({ aliases: ["Shared Pre" + uniq("a")] });
    const b = await mk({ aliases: [...other.aliases] }); // legacy data: already collides
    expect(await code(updateUser(db.prisma, admin, b.id, { appRole: "CREATIVE", fullName: b.fullName, aliases: b.aliases }))).toBe("OK");
    expect(await code(updateUser(db.prisma, admin, b.id, { aliases: [...b.aliases, ...other.aliases.map((a) => a + " ")] }))).toBe("OK"); // same normalised value: not changed
    expect(await code(updateUser(db.prisma, admin, b.id, { aliases: [...b.aliases, other.name] }))).toBe("CONFLICT");
    expect(await code(updateUser(db.prisma, admin, b.id, { fullName: other.fullName }))).toBe("CONFLICT");
  });
});

describe("enum validation", () => {
  it("rejects unknown roles with VALIDATION, not a Prisma error", async () => {
    const u = await mk();
    expect(await code(updateUser(db.prisma, admin, u.id, { appRole: "ROOT" as AppRole }))).toBe("VALIDATION");
    expect(await code(updateUser(db.prisma, admin, u.id, { jobRole: "NINJA" as never }))).toBe("VALIDATION");
    expect(await code(createUser(db.prisma, admin, { name: uniq("E"), jobRole: "OTHER", appRole: "" as AppRole }))).toBe("VALIDATION");
    expect(await code(createUser(db.prisma, admin, { name: uniq("E"), jobRole: undefined as never, appRole: "REQUESTER" }))).toBe("VALIDATION");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims; requires one @ and a dotted domain with no empty labels", async () => {
    const { normalizeEmail } = await import("@/lib/admin");
    expect(normalizeEmail("  Andi@Gmail.COM ")).toBe("andi@gmail.com");
    expect(normalizeEmail("a@sub.clogent.co.id")).toBe("a@sub.clogent.co.id");
    for (const bad of ["andi@gmail", "andi@gmail.", "andi@.com", "andi@gmail..com", "a@b@c.com", "@x.com", "a b@x.com", ""]) {
      expect(() => normalizeEmail(bad), bad).toThrow(AdminError);
    }
  });
});
