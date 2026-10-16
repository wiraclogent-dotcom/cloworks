import { describe, it, expect } from "vitest";
import { refreshJwt, markSessionLength, isExpiredShortSession, SHORT_SESSION_MS, REMEMBER_SESSION_S, type ActiveUserLoader } from "@/lib/session-core";
import { authConfig } from "@/lib/auth.config";

// "Remember me" (R16): unchecked → the session ends 24 h after sign-in; checked → the 30-day cookie lifetime.
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 11, 8);
const member = { id: "u1", name: "Wira", appRole: "ADMIN", jobRole: "OTHER", workspaceId: "clogent", mustChangePassword: false } as const;
const load: ActiveUserLoader = async () => member;
const noDb = {} as Parameters<typeof refreshJwt>[0];
const memberTok = () => ({ uid: "u1", loginEmail: "wira@clogent.co.id", pwv: 0, appRole: "ADMIN" as const, jobRole: "OTHER" as const });

describe("session length", () => {
  it("the cookie lifetime is 30 days; a short session is 24 h", () => {
    expect(REMEMBER_SESSION_S).toBe(30 * 24 * 3600);
    expect(SHORT_SESSION_MS).toBe(24 * HOUR);
  });

  it("markSessionLength: not remembered → short + issuedAt; remembered → neither", () => {
    expect(markSessionLength({ uid: "u1" }, false, T0)).toEqual({ uid: "u1", short: true, issuedAt: T0 });
    expect(markSessionLength({ uid: "u1", short: true, issuedAt: 1 }, true, T0)).toEqual({ uid: "u1" });
  });

  it("a short token ends after 24 h (refreshJwt with an injected clock)", async () => {
    const tok = markSessionLength(memberTok(), false, T0);
    expect(await refreshJwt(noDb, { ...tok }, load, T0 + 23 * HOUR)).not.toBeNull();
    expect(await refreshJwt(noDb, { ...tok }, load, T0 + 24 * HOUR + 1)).toBeNull();
    // A short token without issuedAt (shouldn't exist) fails closed.
    expect(await refreshJwt(noDb, { ...memberTok(), short: true }, load, T0)).toBeNull();
  });

  it("a remembered token survives 25 h (and any time up to the cookie lifetime)", async () => {
    const tok = markSessionLength(memberTok(), true, T0);
    expect(await refreshJwt(noDb, { ...tok }, load, T0 + 25 * HOUR)).not.toBeNull();
    expect(await refreshJwt(noDb, { ...tok }, load, T0 + 29 * 24 * HOUR)).not.toBeNull();
  });

  it("an applicant short token expires too, and its upgrade to a member keeps short + issuedAt", async () => {
    const db = {
      user: { findUnique: async () => ({ id: "a1", email: "andi@gmail.com", active: true, passwordVersion: 0, appRole: "REQUESTER", jobRole: "OTHER" }) },
      applicant: { findUnique: async () => null },
    } as unknown as Parameters<typeof refreshJwt>[0];
    const tok = markSessionLength({ aid: "a1", loginEmail: "andi@gmail.com" }, false, T0);
    const up = await refreshJwt(db, { ...tok }, load, T0 + HOUR);
    expect(up).toMatchObject({ uid: "a1", appRole: "REQUESTER", short: true, issuedAt: T0 });
    expect(up?.aid).toBeUndefined();
    expect(await refreshJwt(db, { ...tok }, load, T0 + 25 * HOUR)).toBeNull();
  });

  it("isExpiredShortSession is pure and only applies to short tokens", () => {
    expect(isExpiredShortSession({}, T0)).toBe(false);
    expect(isExpiredShortSession({ short: true, issuedAt: T0 }, T0 + 24 * HOUR)).toBe(false);
    expect(isExpiredShortSession({ short: true, issuedAt: T0 }, T0 + 24 * HOUR + 1)).toBe(true);
  });

  it("the edge (DB-free) jwt callback drops an expired short token so the proxy clears the cookie", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jwt = (authConfig.callbacks as any).jwt as (a: { token: Record<string, unknown> }) => unknown;
    const fresh = { uid: "u1", short: true, issuedAt: Date.now() };
    expect(await jwt({ token: fresh })).toBe(fresh);
    expect(await jwt({ token: { uid: "u1", short: true, issuedAt: Date.now() - 25 * HOUR } })).toBeNull();
    const kept = { uid: "u1" };
    expect(await jwt({ token: kept })).toBe(kept);
  });
});
