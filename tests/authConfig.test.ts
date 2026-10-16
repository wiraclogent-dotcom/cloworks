import { describe, it, expect } from "vitest";
import { authConfig, routeDecision } from "@/lib/auth.config";

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

describe("proxy matcher", () => {
  it("skips /lobby/enter (its route handler writes the refreshed cookie; the proxy would also re-set the old one)", async () => {
    const { config } = await import("@/proxy");
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/lobby/enter")).toBe(false);
    expect(re.test("/lobby")).toBe(true);
    expect(re.test("/lobby/enterx")).toBe(true);
    expect(re.test("/requests")).toBe(true);
    expect(re.test("/api/auth/session")).toBe(false);
  });
});

describe("routeDecision: who may open which path", () => {
  // true = allowed, false = sent to sign-in, string = redirect target.
  const table: Record<string, Record<"anonymous" | "applicant" | "member", true | false | string>> = {
    "/": { anonymous: true, applicant: "/lobby", member: "/requests" },
    "/signin": { anonymous: true, applicant: true, member: true },
    "/signup": { anonymous: true, applicant: "/lobby", member: true },
    "/join/x": { anonymous: true, applicant: true, member: true },
    "/join/invite/y": { anonymous: true, applicant: true, member: true },
    "/lobby": { anonymous: false, applicant: true, member: "/requests" },
    "/lobby/enter": { anonymous: false, applicant: true, member: "/requests" },
    "/verify": { anonymous: true, applicant: true, member: "/requests" },
    "/opengraph-image": { anonymous: true, applicant: true, member: true },
    "/requests": { anonymous: false, applicant: "/lobby", member: true },
    "/admin/users": { anonymous: false, applicant: "/lobby", member: true },
  };
  for (const [path, row] of Object.entries(table)) {
    for (const [kind, want] of Object.entries(row)) {
      it(`${kind} on ${path} → ${String(want)}`, () => {
        expect(routeDecision(path, kind as "anonymous" | "applicant" | "member")).toBe(want);
      });
    }
  }
  it("members may preview the landing page; /join and /lobbyx are not the public or applicant routes", () => {
    expect(routeDecision("/", "member", { preview: true })).toBe(true);
    expect(routeDecision("/join", "anonymous")).toBe(false);
    expect(routeDecision("/lobbyx", "applicant")).toBe("/lobby");
    expect(routeDecision("/signupx", "anonymous")).toBe(false);
  });
  it("session callback exposes only applicantId for an applicant token; authorized routes it as an applicant", () => {
    const session = cb.session({
      session: { user: { name: "A", email: "a@gmail.com" }, expires: "x" },
      token: { aid: "a1", loginEmail: "a@gmail.com" },
    });
    expect(session.user.applicantId).toBe("a1");
    expect(session.user.loginEmail).toBe("a@gmail.com");
    expect(session.user.id).toBeUndefined();
    expect(session.user.appRole).toBeUndefined();
    const res = cb.authorized({ auth: session, request: req("/requests") });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("location")).toBe("http://localhost:3000/lobby");
    expect(cb.authorized({ auth: session, request: req("/lobby") })).toBe(true);
    expect(cb.authorized({ auth: null, request: req("/lobby") })).toBe(false);
  });
  it("a token carrying both uid and aid is treated as a member, never both", () => {
    const session = cb.session({ session: { user: {}, expires: "x" }, token: { uid: "u1", aid: "a1", appRole: "REQUESTER", jobRole: "OTHER" } });
    expect(session.user.id).toBe("u1");
    expect(session.user.applicantId).toBeUndefined();
  });
});
