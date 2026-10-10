import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// src/lib/db.ts builds its client from .env (the local dev database) the moment anything imports it. Route the app's
// `prisma` to the throwaway test database instead, so this test can never touch real accounts.
const testClient: { current?: object } = vi.hoisted(() => ({}));
vi.mock("@/lib/db", async (orig) => {
  const m = await orig<typeof import("@/lib/db")>();
  const prisma = new Proxy({}, {
    get: (_, k) => {
      if (!testClient.current) throw new Error("test database not ready");
      const v = Reflect.get(testClient.current, k);
      return typeof v === "function" ? v.bind(testClient.current) : v;
    },
  });
  return { ...m, prisma };
});
import type { AppRole } from "@prisma/client";
import { createUser, setUserLoginEmail, setUserPassword, changeOwnPassword } from "@/lib/admin";
import { hashPassword } from "@/lib/password";
import { LOCK_AFTER } from "@/lib/passwordAuth";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { NextRequest } from "next/server.js";

// End-to-end through the real Auth.js handlers (/api/auth/csrf, callback/credentials, session, signout) on a
// throwaway database: an admin creates 10 people with temporary passwords, then each signs in and out several ways.
const BASE = "http://localhost:3000";

type Handlers = { GET: (r: Request) => Promise<Response>; POST: (r: Request) => Promise<Response> };

/** One browser: a cookie jar over the Auth.js route handlers. */
class Browser {
  jar = new Map<string, string>();
  constructor(private h: Handlers) {}
  private cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  private keep(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1);
      const expired = attrs.some((a) => /max-age=0\b/i.test(a) || /expires=thu, 01 jan 1970/i.test(a));
      if (expired || v === "") this.jar.delete(k);
      else this.jar.set(k, v);
    }
    return res;
  }
  async get(path: string) {
    return this.keep(await this.h.GET(new NextRequest(BASE + path, { headers: { cookie: this.cookie() } })));
  }
  async post(path: string, form: Record<string, string>) {
    const body = new URLSearchParams(form).toString();
    return this.keep(
      await this.h.POST(
        new NextRequest(BASE + path, {
          method: "POST",
          body,
          headers: { cookie: this.cookie(), "content-type": "application/x-www-form-urlencoded", origin: BASE },
        }),
      ),
    );
  }
  async csrf() {
    return ((await (await this.get("/api/auth/csrf")).json()) as { csrfToken: string }).csrfToken;
  }
  /** Returns "ok" or the ?error= code the sign-in page would show. */
  async signIn(email: string, password: string) {
    const res = await this.post("/api/auth/callback/credentials", { email, password, csrfToken: await this.csrf(), callbackUrl: `${BASE}/requests` });
    const loc = res.headers.get("location") ?? "";
    const err = new URL(loc, BASE).searchParams.get("error");
    return err ?? (this.jar.has("authjs.session-token") ? "ok" : `no-session(${res.status} ${loc})`);
  }
  async session() {
    const s = (await (await this.get("/api/auth/session")).json()) as { user?: { id: string; email: string } } | null;
    return s?.user ?? null;
  }
  async signOut() {
    await this.post("/api/auth/signout", { csrfToken: await this.csrf(), callbackUrl: `${BASE}/signin` });
  }
}

describe("sign-in / sign-out end to end: 10 accounts created by an admin", () => {
  let db: TestDb;
  let h: Handlers;
  let admin: { id: string; appRole: AppRole; workspaceId: string };
  const people: { id: string; email: string; temp: string; pw: string }[] = [];
  const log: string[] = [];

  beforeAll(async () => {
    db = await createTestDb();
    testClient.current = db.raw;
    process.env.AUTH_SECRET = "test-secret-for-e2e-signin-0123456789abcdef";
    process.env.AUTH_URL = BASE;
    process.env.AUTH_TRUST_HOST = "true";
    process.env.ALLOWED_EMAIL_DOMAIN = "clogent.co.id";
    ({ handlers: h } = (await import("@/lib/auth")) as unknown as { handlers: Handlers });

    const a = await db.prisma.user.create({
      data: { name: "Wira", fullName: "Wira Budi", email: "wira.budi@clogent.co.id", appRole: "ADMIN", passwordHash: await hashPassword("admin-password-1") },
    });
    admin = { id: a.id, appRole: "ADMIN", workspaceId: "clogent" };
    // Same three steps as Admin > People > Add person (create, login email, temporary password).
    for (let i = 1; i <= 10; i++) {
      const p = await createUser(db.prisma, admin, { name: `Tester${i}`, fullName: `Test Person ${i}`, appRole: "REQUESTER", jobRole: "OTHER" });
      const email = `tester${i}@clogent.co.id`;
      await setUserLoginEmail(db.prisma, admin, p.id, email);
      const temp = `Temp-pass-${i}-xyz`;
      await setUserPassword(db.prisma, admin, p.id, temp);
      people.push({ id: p.id, email, temp, pw: temp });
    }
  }, 120_000);
  afterAll(async () => {
    if (process.env.E2E_LOG) (await import("node:fs")).writeFileSync(process.env.E2E_LOG, log.join("\n") + "\n");
    await db?.stop();
  });

  const step = (who: string, what: string, got: unknown, want: unknown) => {
    log.push(`${got === want ? "PASS" : "FAIL"}  ${who.padEnd(9)} ${what} → ${String(got)}`);
    expect(got, `${who}: ${what}`).toBe(want);
  };

  it("admin (your account) signs in and out", async () => {
    const b = new Browser(h);
    step("Wira", "sign in", await b.signIn("wira.budi@clogent.co.id", "admin-password-1"), "ok");
    step("Wira", "session email", (await b.session())?.email, "wira.budi@clogent.co.id");
    await b.signOut();
    step("Wira", "signed out", await b.session(), null);
  });

  it("first sign-in with the temporary password, choose own password, sign in again", async () => {
    for (const [i, p] of people.entries()) {
      const who = `Tester${i + 1}`;
      const b = new Browser(h);
      step(who, "sign in with temp password", await b.signIn(p.email, p.temp), "ok");
      p.pw = `My-own-password-${i + 1}`;
      await changeOwnPassword(db.prisma, p.id, p.temp, p.pw); // what /change-password does
      step(who, "old session ends after change", await b.session(), null);
      step(who, "temp password now refused", await b.signIn(p.email, p.temp), "CredentialsSignin");
      step(who, "sign in with own password", await b.signIn(p.email, p.pw), "ok");
      step(who, "session is the right person", (await b.session())?.id, p.id);
      await b.signOut();
      step(who, "signed out", await b.session(), null);
    }
  }, 120_000);

  it("sign out, then sign in again with the same password (3 rounds each)", async () => {
    for (const [i, p] of people.entries()) {
      const b = new Browser(h);
      for (let r = 1; r <= 3; r++) {
        step(`Tester${i + 1}`, `round ${r} sign in`, await b.signIn(p.email, p.pw), "ok");
        await b.signOut();
        step(`Tester${i + 1}`, `round ${r} signed out`, await b.session(), null);
      }
    }
  }, 120_000);

  it("email typed in capitals / with spaces", async () => {
    for (const [i, p] of people.slice(0, 5).entries()) {
      const b = new Browser(h);
      step(`Tester${i + 1}`, "EMAIL IN CAPS with spaces", await b.signIn(`  ${p.email.toUpperCase()} `, p.pw), "ok");
      await b.signOut();
    }
  }, 60_000);

  it("a wrong password, then the right one", async () => {
    const p = people[5];
    const b = new Browser(h);
    step("Tester6", "wrong password", await b.signIn(p.email, "Wrong-password-1"), "CredentialsSignin");
    step("Tester6", "then right password", await b.signIn(p.email, p.pw), "ok");
    await b.signOut();
  }, 60_000);

  it("sign in again while still signed in, and in two browsers at once", async () => {
    const p = people[6];
    const b1 = new Browser(h);
    const b2 = new Browser(h);
    step("Tester7", "sign in (browser 1)", await b1.signIn(p.email, p.pw), "ok");
    step("Tester7", "sign in again, already signed in", await b1.signIn(p.email, p.pw), "ok");
    step("Tester7", "sign in (browser 2)", await b2.signIn(p.email, p.pw), "ok");
    await b1.signOut();
    step("Tester7", "browser 2 still signed in", (await b2.session())?.id, p.id);
    await b2.signOut();
  }, 60_000);

  it("switching accounts in the same browser", async () => {
    const [a, c] = [people[7], people[8]];
    const b = new Browser(h);
    step("Tester8", "sign in", await b.signIn(a.email, a.pw), "ok");
    await b.signOut();
    step("Tester9", "sign in, same browser", await b.signIn(c.email, c.pw), "ok");
    step("Tester9", "session is Tester9", (await b.session())?.id, c.id);
    await b.signOut();
  }, 60_000);

  it(`${LOCK_AFTER} wrong passwords lock the account; the right one is refused while locked`, async () => {
    const p = people[9];
    const b = new Browser(h);
    for (let n = 1; n <= LOCK_AFTER; n++) await b.signIn(p.email, `Wrong-password-${n}`);
    step("Tester10", "right password while locked", await b.signIn(p.email, p.pw), "CredentialsSignin");
    await setUserPassword(db.prisma, admin, p.id, "Admin-reset-pass-10"); // admin reset clears the lock
    step("Tester10", "after admin reset, new temp password", await b.signIn(p.email, "Admin-reset-pass-10"), "ok");
    await b.signOut();
  }, 60_000);
});
