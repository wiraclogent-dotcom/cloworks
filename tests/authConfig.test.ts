import { describe, it, expect } from "vitest";
import { authConfig } from "@/lib/auth.config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cb = authConfig.callbacks as any;
const req = (path: string) => ({ nextUrl: { pathname: path } });

describe("edge authorized + shared session callback", () => {
  it("token -> session callback -> authorized allows a protected path", () => {
    const session = cb.session({
      session: { user: { name: "A", email: "a@clogent.co.id" }, expires: "x" },
      token: { uid: "u1", appRole: "CREATIVE", jobRole: "DESIGNER" },
    });
    expect(session.user.appRole).toBe("CREATIVE");
    expect(cb.authorized({ auth: session, request: req("/") })).toBe(true);
  });
  it("no appRole or no session is not authorized on protected paths", () => {
    expect(cb.authorized({ auth: { user: { name: "A" } }, request: req("/") })).toBe(false);
    expect(cb.authorized({ auth: null, request: req("/requests") })).toBe(false);
  });
  it("/signin is public, /signinx is not", () => {
    expect(cb.authorized({ auth: null, request: req("/signin") })).toBe(true);
    expect(cb.authorized({ auth: null, request: req("/signinx") })).toBe(false);
  });
});
