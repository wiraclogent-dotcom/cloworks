import { describe, it, expect } from "vitest";
import { authConfig } from "@/lib/auth.config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cb = authConfig.callbacks as any;
const req = (path: string) => ({ nextUrl: new URL(path, "http://localhost:3000") });

describe("edge authorized + shared session callback", () => {
  it("token -> session callback -> authorized allows a protected path", () => {
    const session = cb.session({
      session: { user: { name: "A", email: "a@clogent.co.id" }, expires: "x" },
      token: { uid: "u1", appRole: "CREATIVE", jobRole: "DESIGNER" },
    });
    expect(session.user.appRole).toBe("CREATIVE");
    expect(cb.authorized({ auth: session, request: req("/requests") })).toBe(true);
  });
  it("session callback copies the loginEmail claim; authorized does not need it", () => {
    const session = cb.session({
      session: { user: { name: "A" }, expires: "x" },
      token: { uid: "u1", appRole: "CREATIVE", jobRole: "DESIGNER", loginEmail: "a@clogent.co.id" },
    });
    expect(session.user.loginEmail).toBe("a@clogent.co.id");
    const noClaim = cb.session({ session: { user: { name: "A" }, expires: "x" }, token: { uid: "u1", appRole: "CREATIVE", jobRole: "DESIGNER" } });
    expect(cb.authorized({ auth: noClaim, request: req("/requests") })).toBe(true);
  });
  it("no appRole or no session is not authorized on protected paths", () => {
    expect(cb.authorized({ auth: { user: { name: "A" } }, request: req("/requests") })).toBe(false);
    expect(cb.authorized({ auth: null, request: req("/requests") })).toBe(false);
  });
  it("/ is the public landing page; signed-in people are redirected to /requests", () => {
    expect(cb.authorized({ auth: null, request: req("/") })).toBe(true);
    expect(cb.authorized({ auth: { user: { name: "A" } }, request: req("/") })).toBe(true);
    const res = cb.authorized({ auth: { user: { appRole: "CREATIVE" } }, request: req("/") });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("location")).toBe("http://localhost:3000/requests");
    expect(cb.authorized({ auth: { user: { appRole: "CREATIVE" } }, request: req("/?preview") })).toBe(true);
  });
  it("/signin is public, /signinx is not", () => {
    expect(cb.authorized({ auth: null, request: req("/signin") })).toBe(true);
    expect(cb.authorized({ auth: null, request: req("/signinx") })).toBe(false);
  });
});
