import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole } from "@prisma/client";
import { hashPassword, verifyPassword, checkNewPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { authenticateWithPassword, LOCK_AFTER, LOCK_MINUTES } from "@/lib/passwordAuth";
import { AdminError, setUserPassword, changeOwnPassword } from "@/lib/admin";
import { loadActiveUser, bindSignInToken, refreshJwt } from "@/lib/session-core";
import { createTestDb, type TestDb } from "./helpers/testDb";

type Token = { uid?: string; loginEmail?: string; pwv?: number };

describe("hashPassword / verifyPassword", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
  });
  it("salts: the same password hashes differently", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });
  it("returns false (never throws) for a missing or malformed hash", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "scrypt$bad")).toBe(false);
    expect(await verifyPassword("x", "md5$abc$def")).toBe(false);
  });
});

describe("checkNewPassword", () => {
  it("needs the minimum length and caps the maximum", () => {
    expect(checkNewPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/);
    expect(checkNewPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(checkNewPassword("a".repeat(201))).toMatch(/at most/);
  });
  it("rejects whitespace-only passwords", () => {
    expect(checkNewPassword(" ".repeat(12))).toMatch(/at least/);
  });
});

describe("password sign-in (db)", () => {
  let db: TestDb;
  let admin: { id: string; appRole: AppRole; workspaceId: string };
  let n = 0;
  const uniq = (p: string) => `${p}${++n}`;
  const mk = async (over: Record<string, unknown> = {}, password: string | null = "initial-password-1") => {
    const name = uniq("Pw");
    return db.prisma.user.create({
      data: {
        name,
        fullName: name,
        email: `${name.toLowerCase()}@clogent.co.id`,
        appRole: "REQUESTER",
        passwordHash: password ? await hashPassword(password) : null,
        ...over,
      },
    });
  };
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      if (e instanceof AdminError) return e.code;
      throw e;
    }
    return "OK";
  };

  beforeAll(async () => {
    db = await createTestDb();
    const a = await mk({ appRole: "ADMIN" });
    admin = { id: a.id, appRole: "ADMIN", workspaceId: "clogent" };
  });
  afterAll(async () => {
    await db?.stop();
  });

  it("signs in with the right email (any case, spaces trimmed) and password", async () => {
    const u = await mk();
    const r = await authenticateWithPassword(db.prisma, `  ${u.email!.toUpperCase()} `, "initial-password-1");
    expect(r?.id).toBe(u.id);
  });

  it("rejects a wrong password, an unknown email, no password set, and inactive users", async () => {
    const u = await mk();
    expect(await authenticateWithPassword(db.prisma, u.email!, "wrong-password-1")).toBeNull();
    expect(await authenticateWithPassword(db.prisma, "nobody@clogent.co.id", "initial-password-1")).toBeNull();
    const none = await mk({}, null);
    expect(await authenticateWithPassword(db.prisma, none.email!, "initial-password-1")).toBeNull();
    const off = await mk({ active: false });
    expect(await authenticateWithPassword(db.prisma, off.email!, "initial-password-1")).toBeNull();
  });

  it("rejects an email that is no longer permitted (off-domain and not on the allow-list)", async () => {
    const u = await mk({ email: `${uniq("ext")}@gmail.com` });
    expect(await authenticateWithPassword(db.prisma, u.email!, "initial-password-1")).toBeNull();
    await db.prisma.allowedEmail.create({ data: { email: u.email! } });
    expect((await authenticateWithPassword(db.prisma, u.email!, "initial-password-1"))?.id).toBe(u.id);
  });

  it(`locks for ${LOCK_MINUTES} minutes after ${LOCK_AFTER} failures, even for the right password; success resets`, async () => {
    const u = await mk();
    const t0 = new Date("2026-10-09T10:00:00Z");
    for (let i = 0; i < LOCK_AFTER; i++) expect(await authenticateWithPassword(db.prisma, u.email!, "nope-nope-nope", t0)).toBeNull();
    expect(await authenticateWithPassword(db.prisma, u.email!, "initial-password-1", t0)).toBeNull();
    const later = new Date(t0.getTime() + LOCK_MINUTES * 60_000 + 1000);
    expect((await authenticateWithPassword(db.prisma, u.email!, "initial-password-1", later))?.id).toBe(u.id);
    const row = await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.failedLogins).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });

  it("setUserPassword: admin only, needs a login email, validates, bumps the version and clears a lock", async () => {
    const u = await mk();
    for (const role of ["REQUESTER", "CREATIVE", "LEAD"] as AppRole[])
      expect(await code(setUserPassword(db.prisma, { id: "x", appRole: role, workspaceId: "clogent" }, u.id, "another-password-1"))).toBe("FORBIDDEN");
    expect(await code(setUserPassword(db.prisma, admin, u.id, "short"))).toBe("VALIDATION");
    expect(await code(setUserPassword(db.prisma, admin, "missing", "another-password-1"))).toBe("NOT_FOUND");
    const noEmail = await mk({ email: null });
    expect(await code(setUserPassword(db.prisma, admin, noEmail.id, "another-password-1"))).toBe("VALIDATION");

    await db.prisma.user.update({ where: { id: u.id }, data: { failedLogins: 9, lockedUntil: new Date(Date.now() + 3600_000) } });
    await setUserPassword(db.prisma, admin, u.id, "another-password-1");
    const row = await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.passwordVersion).toBe(1);
    expect(row.failedLogins).toBe(0);
    expect(row.lockedUntil).toBeNull();
    expect(await authenticateWithPassword(db.prisma, u.email!, "initial-password-1")).toBeNull();
    expect((await authenticateWithPassword(db.prisma, u.email!, "another-password-1"))?.id).toBe(u.id);
  });

  it("changeOwnPassword: needs the current password and a valid, different new one", async () => {
    const u = await mk();
    expect(await code(changeOwnPassword(db.prisma, u.id, "wrong-current-1", "brand-new-password"))).toBe("VALIDATION");
    expect(await code(changeOwnPassword(db.prisma, u.id, "initial-password-1", "short"))).toBe("VALIDATION");
    expect(await code(changeOwnPassword(db.prisma, u.id, "initial-password-1", "initial-password-1"))).toBe("VALIDATION");
    const none = await mk({}, null);
    expect(await code(changeOwnPassword(db.prisma, none.id, "", "brand-new-password"))).toBe("VALIDATION");
    await changeOwnPassword(db.prisma, u.id, "initial-password-1", "brand-new-password");
    expect((await authenticateWithPassword(db.prisma, u.email!, "brand-new-password"))?.id).toBe(u.id);
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).passwordVersion).toBe(1);
  });

  it("a password change ends sessions issued before it (old tokens default to version 0)", async () => {
    const u = await mk();
    const token = bindSignInToken<Token>({}, u);
    expect(token.pwv).toBe(0);
    expect(await refreshJwt(db.prisma, { ...token })).not.toBeNull();
    expect(await loadActiveUser(db.prisma, u.id, undefined, { loginEmail: token.loginEmail })).not.toBeNull();

    await setUserPassword(db.prisma, admin, u.id, "reset-by-admin-1");
    expect(await refreshJwt(db.prisma, { ...token })).toBeNull();
    expect(await loadActiveUser(db.prisma, u.id, undefined, { loginEmail: token.loginEmail })).toBeNull();

    const fresh = bindSignInToken<Token>({}, await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } }));
    expect(fresh.pwv).toBe(1);
    expect(await refreshJwt(db.prisma, { ...fresh })).not.toBeNull();
  });
});
