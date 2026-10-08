import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole } from "@prisma/client";
import {
  AdminError, updateUser, createUser, setUserLoginEmail, addAllowedEmail, removeAllowedEmail,
  createBrand, renameBrand, createDivision, renameDivision, upsertRequestType,
} from "@/lib/admin";
import { requireUserWith, refreshJwt } from "@/lib/session-core";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let admin: { id: string; appRole: AppRole };
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
  admin = { id: a.id, appRole: "ADMIN" };
});
afterAll(async () => {
  await db?.stop();
});

describe("FORBIDDEN for non-admins on every core", () => {
  for (const role of ["REQUESTER", "CREATIVE", "LEAD"] as AppRole[]) {
    it(role, async () => {
      const a = { id: "x", appRole: role };
      const p = db.prisma;
      const u = await mk();
      const calls: Promise<unknown>[] = [
        updateUser(p, a, u.id, { active: false }),
        createUser(p, a, { name: uniq("N"), jobRole: "OTHER", appRole: "REQUESTER" }),
        setUserLoginEmail(p, a, u.id, "a@gmail.com"),
        addAllowedEmail(p, a, "a@gmail.com"),
        removeAllowedEmail(p, a, "a@gmail.com"),
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
      const act = { id: a.id, appRole: "ADMIN" as const };
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
      const act = { id: a.id, appRole: "ADMIN" as const };
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
  const sess = (id: string) => async () => ({ user: { id } });
  it("gmail creates an AllowedEmail row and enables login; company domain does not", async () => {
    const u = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, u.id, "  Fadli.Test@Gmail.com ");
    expect((await db.prisma.user.findUnique({ where: { id: u.id } }))?.email).toBe("fadli.test@gmail.com");
    const row = await db.prisma.allowedEmail.findUnique({ where: { email: "fadli.test@gmail.com" } });
    expect(row?.note).toBe(`login for ${u.name}`);
    expect((await requireUserWith(sess(u.id), db.prisma)).id).toBe(u.id);

    const c = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, c.id, "Someone@CLOGENT.co.id");
    expect(await db.prisma.allowedEmail.count({ where: { email: "someone@clogent.co.id" } })).toBe(0);
    expect((await requireUserWith(sess(c.id), db.prisma)).id).toBe(c.id);
  });
  it("lookalike domain is treated as outside (gets an allow-list row)", async () => {
    const u = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, u.id, "x@sub.clogent.co.id");
    expect(await db.prisma.allowedEmail.count({ where: { email: "x@sub.clogent.co.id" } })).toBe(1);
  });
  it("changing the email removes the old row, unless another user still uses it", async () => {
    const u = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, u.id, "old1@gmail.com");
    await setUserLoginEmail(db.prisma, admin, u.id, "new1@gmail.com");
    expect(await db.prisma.allowedEmail.count({ where: { email: "old1@gmail.com" } })).toBe(0);
    expect(await db.prisma.allowedEmail.count({ where: { email: "new1@gmail.com" } })).toBe(1);

    const a = await mk({ email: "shared@gmail.com" });
    await db.prisma.allowedEmail.create({ data: { email: "shared@gmail.com" } });
    const b = await mk({ email: "Shared@Gmail.com" }); // legacy mixed-case duplicate by another user
    await setUserLoginEmail(db.prisma, admin, a.id, "elsewhere@gmail.com");
    expect(await db.prisma.allowedEmail.count({ where: { email: "shared@gmail.com" } })).toBe(1);
    expect(b.id).toBeTruthy();
  });
  it("conflict when another user has it; user keeps their email", async () => {
    const a = await mk({ email: "taken@gmail.com" });
    const b = await mk({ email: null });
    await expect(setUserLoginEmail(db.prisma, admin, b.id, "TAKEN@gmail.com")).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining(a.name) });
    expect((await db.prisma.user.findUnique({ where: { id: b.id } }))?.email).toBeNull();
  });
  it("null clears the email, removes the row and revokes access", async () => {
    const u = await mk({ email: null });
    await setUserLoginEmail(db.prisma, admin, u.id, "gone@gmail.com");
    await setUserLoginEmail(db.prisma, admin, u.id, null);
    expect((await db.prisma.user.findUnique({ where: { id: u.id } }))?.email).toBeNull();
    expect(await db.prisma.allowedEmail.count({ where: { email: "gone@gmail.com" } })).toBe(0);
    await expect(requireUserWith(sess(u.id), db.prisma)).rejects.toThrow();
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

describe("allowed emails", () => {
  it("normalizes, is idempotent, keeps note unless a new one is given", async () => {
    await addAllowedEmail(db.prisma, admin, " Ext@Gmail.com ", "vendor");
    await addAllowedEmail(db.prisma, admin, "ext@gmail.com");
    expect(await db.prisma.allowedEmail.count({ where: { email: "ext@gmail.com" } })).toBe(1);
    expect((await db.prisma.allowedEmail.findUnique({ where: { email: "ext@gmail.com" } }))?.note).toBe("vendor");
    expect(await code(addAllowedEmail(db.prisma, admin, "a@b@c"))).toBe("VALIDATION");
  });
  it("removal is idempotent and revokes an existing session", async () => {
    const u = await mk({ email: "rev@gmail.com" });
    await addAllowedEmail(db.prisma, admin, "REV@gmail.com");
    const s = async () => ({ user: { id: u.id } });
    expect((await requireUserWith(s, db.prisma)).id).toBe(u.id);
    await removeAllowedEmail(db.prisma, admin, " Rev@Gmail.com");
    await removeAllowedEmail(db.prisma, admin, "rev@gmail.com");
    await expect(requireUserWith(s, db.prisma)).rejects.toThrow();
    expect(await refreshJwt(db.prisma, { uid: u.id })).toBeNull();
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
