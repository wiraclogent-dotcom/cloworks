import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { decode } from "next-auth/jwt";
import { seed } from "../prisma/seedCore";
import { refreshJwt, requireUserWith } from "@/lib/session-core";
import {
  assertDevSessionAllowed,
  assertLocalDatabase,
  isLocalDatabaseUrl,
  buildSessionClaims,
  isLocalHostUrl,
  mintSessionToken,
  normalizeEmail,
  sessionCookieName,
} from "@/lib/devSession";
import { createTestDb, type TestDb } from "./helpers/testDb";

const GOOD = { AUTH_URL: "http://localhost:3000", NODE_ENV: "development", AUTH_SECRET: "a-real-looking-secret-0123456789abcdef" };

describe("devSession pure helpers", () => {
  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Wira.Budi@Clogent.co.id ")).toBe("wira.budi@clogent.co.id");
  });

  it("isLocalHostUrl accepts only localhost, 127.0.0.1 and [::1]", () => {
    for (const ok of ["http://localhost:3000", "https://localhost", "http://127.0.0.1:3000/x", "http://[::1]:3000"]) expect(isLocalHostUrl(ok)).toBe(true);
    for (const bad of ["https://tracker.example.com", "http://localhost.evil.com", "http://evil.com/localhost", "http://127.0.0.2", "http://0.0.0.0:3000", "not a url", "", undefined])
      expect(isLocalHostUrl(bad)).toBe(false);
  });

  it("sessionCookieName follows the URL scheme", () => {
    expect(sessionCookieName("http://localhost:3000")).toBe("authjs.session-token");
    expect(sessionCookieName("https://localhost:3000")).toBe("__Secure-authjs.session-token");
  });

  describe("assertDevSessionAllowed", () => {
    it("passes for a local, non-production env with a real secret", () => {
      expect(assertDevSessionAllowed(GOOD)).toEqual({ secret: GOOD.AUTH_SECRET, baseUrl: "http://localhost:3000" });
      expect(assertDevSessionAllowed({ ...GOOD, AUTH_URL: undefined, APP_BASE_URL: "http://127.0.0.1:3000" }).baseUrl).toBe("http://127.0.0.1:3000");
    });
    it("refuses non-local hosts, production, missing or placeholder secret, and no URL", () => {
      expect(() => assertDevSessionAllowed({ ...GOOD, AUTH_URL: "https://tracker.example.com" })).toThrow(/localhost/);
      expect(() => assertDevSessionAllowed({ ...GOOD, APP_BASE_URL: "https://tracker.example.com" })).toThrow(/localhost/);
      expect(() => assertDevSessionAllowed({ ...GOOD, NODE_ENV: "production" })).toThrow(/production/);
      expect(() => assertDevSessionAllowed({ ...GOOD, AUTH_SECRET: undefined })).toThrow(/AUTH_SECRET/);
      expect(() => assertDevSessionAllowed({ ...GOOD, AUTH_SECRET: "  " })).toThrow(/AUTH_SECRET/);
      expect(() => assertDevSessionAllowed({ ...GOOD, AUTH_SECRET: "change-me-generate-with-openssl-rand-base64-32" })).toThrow(/AUTH_SECRET/);
      expect(() => assertDevSessionAllowed({ NODE_ENV: "development", AUTH_SECRET: GOOD.AUTH_SECRET })).toThrow(/AUTH_URL/);
    });
    it("refuses a secret shorter than 16 characters", () => {
      expect(() => assertDevSessionAllowed({ ...GOOD, AUTH_SECRET: "short-secret" })).toThrow(/AUTH_SECRET/);
      expect(assertDevSessionAllowed({ ...GOOD, AUTH_SECRET: "x".repeat(16) }).secret).toBe("x".repeat(16));
    });
    it("never leaks the secret in error messages", () => {
      try { assertDevSessionAllowed({ ...GOOD, AUTH_URL: "https://tracker.example.com" }); } catch (e) { expect(String(e)).not.toContain(GOOD.AUTH_SECRET); }
    });
  });

  describe("database host guard", () => {
    it("accepts only local hosts", () => {
      for (const u of ["postgresql://postgres:postgres@localhost:54329/creative_tracker", "postgres://u:p@127.0.0.1:5432/db", "postgresql://u:p@[::1]:5432/db"])
        expect(isLocalDatabaseUrl(u)).toBe(true);
      for (const u of ["postgresql://u:p@db.example.com:5432/x", "postgresql://u:p@localhost.evil.com/x", "postgresql://u:p@10.0.0.5/x", "postgresql://u:p@localhost/x?host=db.example.com", "http://localhost/x", "", undefined, "not a url"])
        expect(isLocalDatabaseUrl(u)).toBe(false);
    });
    it("assertLocalDatabase refuses without echoing the URL", () => {
      const url = "postgresql://admin:hunter2@prod-db.example.com:5432/app";
      let msg = "";
      try { assertLocalDatabase({ DATABASE_URL: url }); } catch (e) { msg = String(e); }
      expect(msg).toMatch(/DATABASE_URL/);
      expect(msg).not.toMatch(/hunter2|prod-db/);
      expect(() => assertLocalDatabase({})).toThrow(/DATABASE_URL/);
      expect(() => assertLocalDatabase({ DATABASE_URL: "postgresql://u:p@localhost:54329/x" })).not.toThrow();
    });
  });

  it("buildSessionClaims mirrors the jwt callback claims", () => {
    expect(buildSessionClaims({ id: "u1", name: "Wira", email: " Wira.Budi@Clogent.co.id ", appRole: "ADMIN", jobRole: "DESIGNER" })).toEqual({
      sub: "u1", uid: "u1", name: "Wira", email: "wira.budi@clogent.co.id", picture: null, appRole: "ADMIN", jobRole: "DESIGNER", loginEmail: "wira.budi@clogent.co.id",
    });
  });
});

describe("devSession token round-trip (real DB)", () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); await seed(db.prisma); });
  afterAll(async () => { await db?.stop(); });

  it("a minted token decodes with the secret and passes refreshJwt + requireUserWith", async () => {
    const wira = await db.prisma.user.findFirstOrThrow({ where: { email: "wira.budi@clogent.co.id" } });
    const cookieName = sessionCookieName(GOOD.AUTH_URL);
    const jwt = await mintSessionToken(wira, GOOD.AUTH_SECRET, cookieName);

    const token = await decode({ token: jwt, secret: GOOD.AUTH_SECRET, salt: cookieName });
    expect(token).toMatchObject({ uid: wira.id, sub: wira.id, appRole: "ADMIN", jobRole: "DESIGNER", loginEmail: "wira.budi@clogent.co.id" });
    expect(token!.exp! - token!.iat!).toBe(24 * 60 * 60);

    const refreshed = await refreshJwt(db.prisma, token as { uid?: string; loginEmail?: string });
    expect(refreshed).not.toBeNull();
    const me = await requireUserWith(async () => ({ user: { id: token!.uid as string, loginEmail: token!.loginEmail as string } }), db.prisma);
    expect(me).toEqual({ id: wira.id, name: wira.name, appRole: "ADMIN", jobRole: "DESIGNER", workspaceId: "clogent", mustChangePassword: false });

    // wrong salt / secret do not decode
    await expect(decode({ token: jwt, secret: GOOD.AUTH_SECRET, salt: "other" })).rejects.toThrow();
    await expect(decode({ token: jwt, secret: "different-secret", salt: cookieName })).rejects.toThrow();
  });

  it("is revoked when the user is deactivated or the email is rebound", async () => {
    const wira = await db.prisma.user.findFirstOrThrow({ where: { email: "wira.budi@clogent.co.id" } });
    const token = { uid: wira.id, loginEmail: "wira.budi@clogent.co.id" };
    await db.prisma.user.update({ where: { id: wira.id }, data: { email: "other@clogent.co.id" } });
    expect(await refreshJwt(db.prisma, token)).toBeNull();
    await db.prisma.user.update({ where: { id: wira.id }, data: { email: "wira.budi@clogent.co.id" } });
  });
});
