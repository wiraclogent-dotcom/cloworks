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
import type { Actor } from "@/lib/admin";
import { hashPassword } from "@/lib/password";
import { signUp, verifyCode } from "@/lib/applicants";
import { approveApplicant } from "@/lib/joinRequests";
import { newJoinCode } from "@/lib/joinTokens";
import type { Mailer } from "@/lib/mailer";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { NextRequest } from "next/server.js";

// End-to-end through the real Auth.js handlers on a throwaway database: someone signs up, verifies, signs in as an
// applicant (no workspace access), an admin approves, and the same browser session becomes a member.
const BASE = "http://localhost:3000";

type SessionJson = { id?: string; email?: string; applicantId?: string; appRole?: string; jobRole?: string; loginEmail?: string };
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
    const s = (await (await this.get("/api/auth/session")).json()) as { user?: SessionJson } | null;
    return s?.user ?? null;
  }
  async signOut() {
    await this.post("/api/auth/signout", { csrfToken: await this.csrf(), callbackUrl: `${BASE}/signin` });
  }
}

describe("sign up → applicant session → approval upgrades the same session", () => {
  let db: TestDb;
  let h: Handlers;
  let admin: Actor;
  let joinCode: string;
  const sent: { to: string; subject: string; text: string }[] = [];
  const mailer: Mailer = { async send(m) { sent.push(m); } };
  const deps = () => ({ db: db.raw, mailer, secret: "e2e-code-secret", baseUrl: BASE, onRequest: async () => {} });

  beforeAll(async () => {
    db = await createTestDb();
    testClient.current = db.raw;
    process.env.AUTH_SECRET = "test-secret-for-e2e-signup-0123456789abcdef";
    process.env.AUTH_URL = BASE;
    process.env.AUTH_TRUST_HOST = "true";
    ({ handlers: h } = (await import("@/lib/auth")) as unknown as { handlers: Handlers });
    const a = await db.raw.user.create({
      data: { name: "Wira", fullName: "Wira Budi", email: "wira.budi@clogent.co.id", appRole: "ADMIN", workspaceId: "clogent", passwordHash: await hashPassword("admin-password-1") },
    });
    admin = { id: a.id, appRole: "ADMIN", workspaceId: "clogent" };
    joinCode = newJoinCode();
    await db.raw.workspace.update({ where: { id: "clogent" }, data: { joinCode, joinLinkEnabled: true } });
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it("verified applicant signs in, sees only applicantId, and becomes a REQUESTER with the same id after approval", async () => {
    const email = "andi.new@gmail.com";
    const password = "Andi-password-123";
    const { applicantId } = await signUp(deps(), { name: "Andi", email, password, joinCode });
    expect(applicantId).toBeTruthy();
    const code = sent.at(-1)!.text.match(/\d{6}/)![0];
    expect(await verifyCode(deps(), applicantId!, code)).toEqual({ joined: true });

    const b = new Browser(h);
    expect(await b.signIn("Andi.New@Gmail.com", "wrong-password-1")).toBe("CredentialsSignin");
    expect(await b.signIn("Andi.New@Gmail.com", password)).toBe("ok");
    const s1 = await b.session();
    expect(s1?.applicantId).toBe(applicantId);
    expect(s1?.loginEmail).toBe(email);
    expect(s1?.appRole).toBeUndefined();
    expect(s1?.id).toBeUndefined();

    await approveApplicant(db.raw, admin, mailer, applicantId!, { appRole: "REQUESTER", jobRole: "OTHER" }, BASE);
    const s2 = await b.session();
    expect(s2?.appRole).toBe("REQUESTER");
    expect(s2?.id).toBe(applicantId);
    expect(s2?.applicantId).toBeUndefined();
    // The upgraded cookie keeps working, and the member can sign in fresh with the same password.
    expect((await b.session())?.id).toBe(applicantId);
    await b.signOut();
    expect(await b.session()).toBeNull();
    expect(await b.signIn(email, password)).toBe("ok");
    expect((await b.session())?.appRole).toBe("REQUESTER");
  }, 120_000);

  it("an applicant whose row disappears (deleted, not approved) loses the session", async () => {
    const email = "gone.soon@gmail.com";
    const { applicantId } = await signUp(deps(), { name: "Gone", email, password: "Gone-password-123" });
    const b = new Browser(h);
    expect(await b.signIn(email, "Gone-password-123")).toBe("ok");
    expect((await b.session())?.applicantId).toBe(applicantId);
    await db.raw.applicant.delete({ where: { id: applicantId! } });
    expect(await b.session()).toBeNull();
  }, 60_000);

  it("existing member sign-in is unchanged", async () => {
    const b = new Browser(h);
    expect(await b.signIn("wira.budi@clogent.co.id", "admin-password-1")).toBe("ok");
    const s = await b.session();
    expect(s).toMatchObject({ id: admin.id, appRole: "ADMIN" });
    expect(s?.applicantId).toBeUndefined();
  }, 60_000);
});
