import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole } from "@prisma/client";
import { hashPassword, verifyPassword, checkNewPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { authenticateWithPassword, LOCK_AFTER, LOCK_MINUTES, type PasswordIdentity } from "@/lib/passwordAuth";
import { AdminError, setUserPassword, changeOwnPassword } from "@/lib/admin";
import { loadActiveUser, bindSignInToken, refreshJwt } from "@/lib/session-core";
import { createTestDb, type TestDb } from "./helpers/testDb";

const userIdOf = (r: PasswordIdentity | null) => (r?.kind === "user" ? r.user.id : undefined);

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
    const r = await authenticateWithPassword(db.raw, `  ${u.email!.toUpperCase()} `, "initial-password-1");
    expect(r?.kind === "user" && r.user.id).toBe(u.id);
  });

  it("rejects a wrong password, an unknown email, no password set, and inactive users", async () => {
    const u = await mk();
    expect(await authenticateWithPassword(db.raw, u.email!, "wrong-password-1")).toBeNull();
    expect(await authenticateWithPassword(db.raw, "nobody@clogent.co.id", "initial-password-1")).toBeNull();
    const none = await mk({}, null);
    expect(await authenticateWithPassword(db.raw, none.email!, "initial-password-1")).toBeNull();
    const off = await mk({ active: false });
    expect(await authenticateWithPassword(db.raw, off.email!, "initial-password-1")).toBeNull();
  });

  it("accepts an active user on any email domain", async () => {
    const u = await mk({ email: `${uniq("ext")}@gmail.com` });
    const r = await authenticateWithPassword(db.raw, u.email!, "initial-password-1");
    expect(r?.kind === "user" && r.user.id).toBe(u.id);
  });

  it(`locks for ${LOCK_MINUTES} minutes after ${LOCK_AFTER} failures, even for the right password; success resets`, async () => {
    const u = await mk();
    const t0 = new Date("2026-10-09T10:00:00Z");
    for (let i = 0; i < LOCK_AFTER; i++) expect(await authenticateWithPassword(db.raw, u.email!, "nope-nope-nope", t0)).toBeNull();
    expect(await authenticateWithPassword(db.raw, u.email!, "initial-password-1", t0)).toBeNull();
    const later = new Date(t0.getTime() + LOCK_MINUTES * 60_000 + 1000);
    const r = await authenticateWithPassword(db.raw, u.email!, "initial-password-1", later);
    expect(r?.kind === "user" && r.user.id).toBe(u.id);
    const row = await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.failedLogins).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });

  it("applicant password sign-in returns kind applicant; 5 wrong → locked 15 min", async () => {
    const email = `${uniq("appl")}@gmail.com`;
    const a = await db.raw.applicant.create({ data: { email, name: "Appl", passwordHash: await hashPassword("applicant-pass-1") } });
    const ok = await authenticateWithPassword(db.raw, ` ${email.toUpperCase()} `, "applicant-pass-1");
    expect(ok?.kind === "applicant" && ok.applicant.id).toBe(a.id);

    const t0 = new Date("2026-10-11T10:00:00Z");
    for (let i = 0; i < LOCK_AFTER; i++) expect(await authenticateWithPassword(db.raw, email, "wrong-pass-123", t0)).toBeNull();
    const locked = await db.raw.applicant.findUniqueOrThrow({ where: { id: a.id } });
    expect(locked.lockedUntil?.getTime()).toBe(t0.getTime() + LOCK_MINUTES * 60_000);
    expect(await authenticateWithPassword(db.raw, email, "applicant-pass-1", t0)).toBeNull();
    const later = new Date(t0.getTime() + LOCK_MINUTES * 60_000 + 1000);
    expect((await authenticateWithPassword(db.raw, email, "applicant-pass-1", later))?.kind).toBe("applicant");
    expect(await db.raw.applicant.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ failedLogins: 0, lockedUntil: null });
  });

  it("an applicant without a password (Google-only) is refused like an unknown email; a User row wins over an applicant row", async () => {
    const email = `${uniq("goog")}@gmail.com`;
    await db.raw.applicant.create({ data: { email, name: "G", emailVerifiedAt: new Date() } });
    expect(await authenticateWithPassword(db.raw, email, "anything-at-all")).toBeNull();

    const both = `${uniq("both")}@gmail.com`;
    await db.raw.applicant.create({ data: { email: both, name: "B", passwordHash: await hashPassword("applicant-pass-1") } });
    const u = await mk({ email: both }, null);
    expect(await authenticateWithPassword(db.raw, both, "applicant-pass-1")).toBeNull();
    expect((await db.raw.user.findUniqueOrThrow({ where: { id: u.id } })).failedLogins).toBe(0);
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
    expect(await authenticateWithPassword(db.raw, u.email!, "initial-password-1")).toBeNull();
    expect(userIdOf(await authenticateWithPassword(db.raw, u.email!, "another-password-1"))).toBe(u.id);
  });

  it("setUserPassword flags the user to change it; changeOwnPassword clears the flag", async () => {
    const u = await mk();
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(false);
    await setUserPassword(db.prisma, admin, u.id, "temporary-pass-1");
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(true);
    await changeOwnPassword(db.prisma, u.id, "temporary-pass-1", "my-own-password-1");
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(false);
  });

  it("changeOwnPassword: needs the current password and a valid, different new one", async () => {
    const u = await mk();
    expect(await code(changeOwnPassword(db.prisma, u.id, "wrong-current-1", "brand-new-password"))).toBe("VALIDATION");
    expect(await code(changeOwnPassword(db.prisma, u.id, "initial-password-1", "short"))).toBe("VALIDATION");
    expect(await code(changeOwnPassword(db.prisma, u.id, "initial-password-1", "initial-password-1"))).toBe("VALIDATION");
    const none = await mk({}, null);
    expect(await code(changeOwnPassword(db.prisma, none.id, "", "brand-new-password"))).toBe("VALIDATION");
    await changeOwnPassword(db.prisma, u.id, "initial-password-1", "brand-new-password");
    expect(userIdOf(await authenticateWithPassword(db.raw, u.email!, "brand-new-password"))).toBe(u.id);
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).passwordVersion).toBe(1);
  });

  it("a password change ends sessions issued before it (old tokens default to version 0)", async () => {
    const u = await mk();
    const token = bindSignInToken<Token>({}, u);
    expect(token.pwv).toBe(0);
    expect(await refreshJwt(db.prisma, { ...token })).not.toBeNull();
    expect(await loadActiveUser(db.prisma, u.id, { loginEmail: token.loginEmail })).not.toBeNull();

    await setUserPassword(db.prisma, admin, u.id, "reset-by-admin-1");
    expect(await refreshJwt(db.prisma, { ...token })).toBeNull();
    expect(await loadActiveUser(db.prisma, u.id, { loginEmail: token.loginEmail })).toBeNull();

    const fresh = bindSignInToken<Token>({}, await db.prisma.user.findUniqueOrThrow({ where: { id: u.id } }));
    expect(fresh.pwv).toBe(1);
    expect(await refreshJwt(db.prisma, { ...fresh })).not.toBeNull();
  });
});
