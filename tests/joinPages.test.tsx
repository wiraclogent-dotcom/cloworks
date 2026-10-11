// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { render, screen, cleanup } from "@testing-library/react";

const redirect = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
vi.mock("next/font/google", () => ({ Bricolage_Grotesque: () => ({ variable: "font-display" }) }));
const reqHeaders = vi.hoisted(() => ({ current: { host: "app.test", "x-forwarded-proto": "https" } as Record<string, string> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(reqHeaders.current) }));
const signIn = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: (...a: unknown[]) => signIn(...a), signOut: (...a: unknown[]) => signOut(...a) }));
vi.mock("@/lib/db", () => ({ prisma: { db: true } }));
vi.mock("@/lib/mailer", () => ({ createMailerFromEnv: () => ({ send: vi.fn() }) }));
const currentVisitor = vi.fn();
const requireApplicantOrRedirect = vi.fn();
vi.mock("@/lib/session", () => ({ currentVisitor: () => currentVisitor(), requireApplicantOrRedirect: () => requireApplicantOrRedirect() }));
const lib = vi.hoisted(() => ({
  signUp: vi.fn(), verifyCode: vi.fn(), resendCode: vi.fn(), requestJoinByCode: vi.fn(), describeJoinCode: vi.fn(), lobbyState: vi.fn(),
  describeInvite: vi.fn(), acceptInvite: vi.fn(),
}));
vi.mock("@/lib/applicants", async (orig) => {
  const m = await orig<typeof import("@/lib/applicants")>();
  return {
    ...m, signUp: lib.signUp, verifyCode: lib.verifyCode, resendCode: lib.resendCode, requestJoinByCode: lib.requestJoinByCode,
    describeJoinCode: lib.describeJoinCode, lobbyState: lib.lobbyState,
  };
});
vi.mock("@/lib/invites", async (orig) => ({ ...(await orig<typeof import("@/lib/invites")>()), describeInvite: lib.describeInvite, acceptInvite: lib.acceptInvite }));
vi.mock("@/app/lobby/LobbyPoll", () => ({ LobbyPoll: () => <div data-testid="lobby-poll" /> }));

import SignInPage from "@/app/signin/page";
import { passwordSignIn, googleSignIn } from "@/app/signin/actions";
import { SignUpView } from "@/app/signup/SignUpView";
import { signUpAction } from "@/app/signup/actions";
import { VerifyView } from "@/app/verify/VerifyView";
import { verifyAction, resendAction } from "@/app/verify/actions";
import { LobbyView } from "@/app/lobby/LobbyView";
import { joinWithCodeAction } from "@/app/lobby/actions";
import { JoinCodeView } from "@/app/join/[code]/JoinCodeView";
import { InviteView } from "@/app/join/invite/[token]/InviteView";
import { acceptInviteAction } from "@/app/join/invite/[token]/actions";
import { JoinError } from "@/lib/applicants";
import { AdminError } from "@/lib/admin";

const applicant = { kind: "applicant", applicant: { id: "a1", email: "andi@gmail.com", name: "Andi" } } as const;
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const sp = <T extends object>(o: T) => Promise.resolve(o);
const text = () => document.body.textContent ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_BASE_URL", "");
  vi.stubEnv("AUTH_SECRET", "test-secret");
  currentVisitor.mockResolvedValue({ kind: "none" });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("/signin", () => {
  it("links to /signup, carrying a safe next through", async () => {
    await act(async () => { render(<SignInPage searchParams={sp({ next: "/join/abc" })} />); });
    const link = await screen.findByRole("link", { name: /create an account/i });
    expect(link.getAttribute("href")).toBe("/signup?next=%2Fjoin%2Fabc");
    cleanup();
    await act(async () => { render(<SignInPage searchParams={sp({ next: "https://evil.example" })} />); });
    expect((await screen.findByRole("link", { name: /create an account/i })).getAttribute("href")).toBe("/signup");
  });
  it("password sign-in honours a safe next and falls back to /requests", async () => {
    await passwordSignIn(fd({ email: "a@b.co", password: "x", next: "/join/abc" }));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "a@b.co", password: "x", redirectTo: "/join/abc" });
    await passwordSignIn(fd({ email: "a@b.co", password: "x", next: "//evil.example" }));
    expect(signIn).toHaveBeenLastCalledWith("credentials", { email: "a@b.co", password: "x", redirectTo: "/requests" });
  });
  it("Google sign-in honours a safe next", async () => {
    await googleSignIn(fd({ next: "/join/invite/tok" }));
    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/join/invite/tok" });
    await googleSignIn(fd({ next: "/admin" }));
    expect(signIn).toHaveBeenLastCalledWith("google", { redirectTo: "/requests" });
  });
});

describe("/signup", () => {
  it("shows name, email and password, and Google only when it is configured", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    render(await SignUpView({ searchParams: sp({}) }));
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).type).toBe("email");
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
    cleanup();
    vi.stubEnv("AUTH_GOOGLE_ID", "gid");
    render(await SignUpView({ searchParams: sp({ join: "abc" }) }));
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    expect((document.querySelector('input[name="join"]') as HTMLInputElement).value).toBe("abc");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/signin?next=%2Fjoin%2Fabc");
  });
  it("drops a join code that is not a code", async () => {
    render(await SignUpView({ searchParams: sp({ join: "<script>" }) }));
    expect(document.querySelector('input[name="join"]')).toBeNull();
    expect(text()).not.toContain("<script>");
  });
  it("signs a new applicant in and sends them to /verify with the join link as next", async () => {
    lib.signUp.mockResolvedValue({ applicantId: "a1" });
    await signUpAction(null, fd({ name: "Andi", email: "andi@gmail.com", password: "long-enough-1", join: "abc" }));
    expect(lib.signUp).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "https://app.test", secret: "test-secret" }), {
      name: "Andi", email: "andi@gmail.com", password: "long-enough-1", joinCode: "abc",
    });
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "andi@gmail.com", password: "long-enough-1", redirectTo: "/verify?next=%2Fjoin%2Fabc" });
  });
  it("never derives email links from request headers in production (R14)", async () => {
    const { requestBaseUrl } = await import("@/lib/joinDeps");
    reqHeaders.current = { host: "app.test", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" };
    try {
      vi.stubEnv("NODE_ENV", "production");
      expect(await requestBaseUrl()).toBe("");
      vi.stubEnv("APP_BASE_URL", "https://cloworks.example");
      expect(await requestBaseUrl()).toBe("https://cloworks.example");
      vi.stubEnv("APP_BASE_URL", "");
      vi.stubEnv("NODE_ENV", "development");
      expect(await requestBaseUrl()).toBe("https://evil.example");
      reqHeaders.current = { host: "localhost:3000" };
      expect(await requestBaseUrl()).toBe("http://localhost:3000");
    } finally {
      reqHeaders.current = { host: "app.test", "x-forwarded-proto": "https" };
    }
  });
  it("prefers APP_BASE_URL for email links", async () => {
    vi.stubEnv("APP_BASE_URL", "https://cloworks.example/");
    lib.signUp.mockResolvedValue({ applicantId: "a1" });
    await signUpAction(null, fd({ name: "Andi", email: "andi@gmail.com", password: "long-enough-1" }));
    expect(lib.signUp.mock.calls[0][0].baseUrl).toBe("https://cloworks.example");
    expect(signIn.mock.calls[0][1].redirectTo).toBe("/verify");
  });
  it("an email that already has an account lands on /verify without signing in", async () => {
    lib.signUp.mockResolvedValue({ applicantId: null });
    await expect(signUpAction(null, fd({ name: "Andi", email: "taken@gmail.com", password: "long-enough-1" }))).rejects.toThrow("NEXT_REDIRECT:/verify");
    expect(signIn).not.toHaveBeenCalled();
  });
  it("shows validation copy and keeps name and email, never the password", async () => {
    lib.signUp.mockRejectedValue(new JoinError("VALIDATION", "Enter a valid email address."));
    const r = await signUpAction(null, fd({ name: "Andi", email: "nope", password: "pw" }));
    expect(r).toMatchObject({ error: "Enter a valid email address.", values: { name: "Andi", email: "nope" } });
    expect(JSON.stringify(r)).not.toContain("pw\"");
  });
});

describe("/verify", () => {
  it("renders the same code screen for anonymous visitors, without any email", async () => {
    render(await VerifyView({ searchParams: sp({}) }));
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verify" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /resend code/i })).toBeTruthy();
    expect(text()).not.toContain("@");
  });
  it("sends an already verified applicant to /lobby and a member to /requests", async () => {
    currentVisitor.mockResolvedValue(applicant);
    lib.lobbyState.mockResolvedValue({ kind: "none" });
    await expect(VerifyView({ searchParams: sp({}) })).rejects.toThrow("NEXT_REDIRECT:/lobby");
    currentVisitor.mockResolvedValue({ kind: "member" });
    await expect(VerifyView({ searchParams: sp({}) })).rejects.toThrow("NEXT_REDIRECT:/requests");
  });
  it("anonymous submit and resend get the fixed answers and touch nothing", async () => {
    expect(await verifyAction(null, fd({ code: "123456" }))).toMatchObject({ error: "That code isn't right or has expired." });
    expect(await resendAction()).toMatchObject({ info: "We sent a new code." });
    expect(lib.verifyCode).not.toHaveBeenCalled();
    expect(lib.resendCode).not.toHaveBeenCalled();
  });
  it("a correct code goes to next, or to the lobby with a notice", async () => {
    currentVisitor.mockResolvedValue(applicant);
    lib.verifyCode.mockResolvedValue({ joined: false });
    await expect(verifyAction(null, fd({ code: "123456", next: "/join/invite/tok" }))).rejects.toThrow("NEXT_REDIRECT:/join/invite/tok");
    expect(lib.verifyCode).toHaveBeenCalledWith(expect.anything(), "a1", "123456");
    await expect(verifyAction(null, fd({ code: "123456", next: "https://evil" }))).rejects.toThrow("NEXT_REDIRECT:/lobby");
    lib.verifyCode.mockResolvedValue({ joined: true });
    await expect(verifyAction(null, fd({ code: "123456", next: "/join/abc" }))).rejects.toThrow("NEXT_REDIRECT:/lobby");
    lib.verifyCode.mockResolvedValue({ joined: false, notice: "LINK_INVALID" });
    await expect(verifyAction(null, fd({ code: "123456", next: "/join/abc" }))).rejects.toThrow("NEXT_REDIRECT:/lobby?notice=LINK_INVALID");
  });
  it("maps code errors to fixed copy", async () => {
    currentVisitor.mockResolvedValue(applicant);
    lib.verifyCode.mockRejectedValue(new JoinError("CODE_EXPIRED", "x"));
    expect(await verifyAction(null, fd({ code: "123456" }))).toMatchObject({ error: "That code isn't right or has expired." });
    lib.verifyCode.mockRejectedValue(new JoinError("TOO_MANY", "x"));
    expect(await verifyAction(null, fd({ code: "123456" }))).toMatchObject({ error: "Too many wrong codes. Ask for a new one." });
    expect(await verifyAction(null, fd({ code: "12ab" }))).toMatchObject({ error: "That code isn't right or has expired." });
  });
  it("resend for an applicant sends a code, or explains the limit", async () => {
    currentVisitor.mockResolvedValue(applicant);
    lib.resendCode.mockResolvedValue(undefined);
    expect(await resendAction()).toMatchObject({ info: "We sent a new code." });
    lib.resendCode.mockRejectedValue(new JoinError("RATE_LIMITED", "Wait a minute before asking for another code."));
    expect(await resendAction()).toMatchObject({ error: "Wait a minute before asking for another code." });
  });
});

describe("/lobby", () => {
  beforeEach(() => requireApplicantOrRedirect.mockResolvedValue(applicant.applicant));
  it("waiting: names the workspace and polls", async () => {
    lib.lobbyState.mockResolvedValue({ kind: "waiting", workspaceName: "Clogent" });
    render(await LobbyView({ searchParams: sp({}) }));
    expect(text()).toContain("Request sent to Clogent. We'll email you when you're approved.");
    expect(screen.getByTestId("lobby-poll")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
  it("none: offers the paste form, no polling", async () => {
    lib.lobbyState.mockResolvedValue({ kind: "none" });
    render(await LobbyView({ searchParams: sp({ notice: "LINK_INVALID" }) }));
    expect(text()).toContain("You're not in a workspace yet. Ask your admin for an invite link, or paste it here.");
    expect(screen.getByLabelText("Invite link")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("no longer works");
    expect(screen.queryByTestId("lobby-poll")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
  it("rejected: says so, no polling", async () => {
    lib.lobbyState.mockResolvedValue({ kind: "rejected", workspaceName: "Clogent" });
    render(await LobbyView({ searchParams: sp({ notice: "<b>x" }) }));
    expect(text()).toContain("Your request to Clogent wasn't approved.");
    expect(text()).not.toContain("<b>x");
    expect(screen.queryByTestId("lobby-poll")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
  it("unverified goes to /verify; a gone row goes to /signin", async () => {
    lib.lobbyState.mockResolvedValue({ kind: "unverified" });
    await expect(LobbyView({ searchParams: sp({}) })).rejects.toThrow("NEXT_REDIRECT:/verify");
    lib.lobbyState.mockResolvedValue(null);
    await expect(LobbyView({ searchParams: sp({}) })).rejects.toThrow("NEXT_REDIRECT:/signin");
  });
  it("joinWithCodeAction takes a full link or a bare code, but not invite links", async () => {
    currentVisitor.mockResolvedValue(applicant);
    lib.requestJoinByCode.mockResolvedValue(undefined);
    await expect(joinWithCodeAction(null, fd({ link: "https://cloworks.example/join/Ab_c-1?x=1" }))).rejects.toThrow("NEXT_REDIRECT:/lobby");
    expect(lib.requestJoinByCode).toHaveBeenLastCalledWith(expect.anything(), "a1", "Ab_c-1");
    await expect(joinWithCodeAction(null, fd({ link: " Ab_c-1 " }))).rejects.toThrow("NEXT_REDIRECT:/lobby");
    expect(lib.requestJoinByCode).toHaveBeenLastCalledWith(expect.anything(), "a1", "Ab_c-1");
    lib.requestJoinByCode.mockClear();
    expect(await joinWithCodeAction(null, fd({ link: "https://x/join/invite/tok" }))).toMatchObject({ error: expect.stringContaining("invite link") });
    expect(await joinWithCodeAction(null, fd({ link: "not a code!" }))).toMatchObject({ error: expect.any(String) });
    expect(lib.requestJoinByCode).not.toHaveBeenCalled();
  });
  it("joinWithCodeAction maps join errors to fixed copy", async () => {
    currentVisitor.mockResolvedValue(applicant);
    lib.requestJoinByCode.mockRejectedValue(new JoinError("LINK_INVALID", "x"));
    expect(await joinWithCodeAction(null, fd({ link: "abc" }))).toMatchObject({ error: "This link no longer works. Ask your admin for a new one." });
    lib.requestJoinByCode.mockRejectedValue(new JoinError("INACTIVE_MEMBER", "x"));
    expect(await joinWithCodeAction(null, fd({ link: "abc" }))).toMatchObject({ error: expect.stringContaining("Contact your admin") });
    currentVisitor.mockResolvedValue({ kind: "none" });
    await expect(joinWithCodeAction(null, fd({ link: "abc" }))).rejects.toThrow("NEXT_REDIRECT:/signin");
  });
});

describe("/join/[code]", () => {
  const params = (code: string) => sp({ code });
  it("anonymous: Join Clogent on Cloworks with sign-up and sign-in links", async () => {
    lib.describeJoinCode.mockResolvedValue({ workspaceName: "Clogent" });
    render(await JoinCodeView({ params: params("abc") }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Join Clogent on Cloworks");
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe("/signup?join=abc");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/signin?next=%2Fjoin%2Fabc");
  });
  it("a dead link says so", async () => {
    lib.describeJoinCode.mockResolvedValue(null);
    render(await JoinCodeView({ params: params("gone") }));
    expect(text()).toContain("This link no longer works. Ask your admin for a new one.");
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
  });
  it("applicant: Request to join; member: already in", async () => {
    lib.describeJoinCode.mockResolvedValue({ workspaceName: "Clogent" });
    currentVisitor.mockResolvedValue(applicant);
    render(await JoinCodeView({ params: params("abc") }));
    expect(screen.getByRole("button", { name: "Request to join" })).toBeTruthy();
    expect((document.querySelector('input[name="link"]') as HTMLInputElement).value).toBe("abc");
    cleanup();
    currentVisitor.mockResolvedValue({ kind: "member" });
    render(await JoinCodeView({ params: params("abc") }));
    expect(text()).toContain("You're already in Clogent");
    expect(screen.getByRole("link", { name: /requests/i }).getAttribute("href")).toBe("/requests");
  });
});

describe("/join/invite/[token]", () => {
  const params = sp({ token: "tok" });
  const open = { status: "open", workspaceName: "Clogent", inviterName: "Wira", appRole: "CREATIVE", jobRole: "DESIGNER", maskedEmail: "a***@gmail.com", email: "andi@gmail.com" };
  it("anonymous: names the inviter, workspace and role, shows only the masked email", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "gid");
    lib.describeInvite.mockResolvedValue(open);
    render(await InviteView({ params }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Wira invited you to Clogent as Designer");
    expect(text()).toContain("a***@gmail.com");
    expect(text()).not.toContain("andi@gmail.com");
    expect(screen.getByLabelText("Your name")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    expect((document.querySelector('input[name="next"]') as HTMLInputElement).value).toBe("/join/invite/tok");
  });
  it("expired or used: ask the inviter; unknown: ask your admin", async () => {
    lib.describeInvite.mockResolvedValue({ ...open, status: "expired" });
    render(await InviteView({ params }));
    expect(text()).toContain("This invite has expired — ask Wira for a new one.");
    cleanup();
    lib.describeInvite.mockResolvedValue(null);
    render(await InviteView({ params }));
    expect(text()).toContain("This invite has expired — ask your admin for a new one.");
  });
  it("applicant: Accept; member: already a member", async () => {
    lib.describeInvite.mockResolvedValue(open);
    currentVisitor.mockResolvedValue(applicant);
    render(await InviteView({ params }));
    expect(screen.getByRole("button", { name: "Accept invite" })).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    cleanup();
    currentVisitor.mockResolvedValue({ kind: "member" });
    render(await InviteView({ params }));
    expect(text()).toContain("You're already a member");
  });
  it("password path accepts then signs in to /requests", async () => {
    lib.acceptInvite.mockResolvedValue({ userId: "u1", email: "andi@gmail.com" });
    await acceptInviteAction(null, fd({ token: "tok", mode: "password", name: "Andi", password: "long-enough-1" }));
    expect(lib.acceptInvite).toHaveBeenCalledWith({ db: true }, "tok", { name: "Andi", password: "long-enough-1" });
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "andi@gmail.com", password: "long-enough-1", redirectTo: "/requests" });
  });
  it("applicant path accepts with the session's applicant and goes to /requests", async () => {
    currentVisitor.mockResolvedValue(applicant);
    lib.acceptInvite.mockResolvedValue({ userId: "a1", email: "andi@gmail.com" });
    await expect(acceptInviteAction(null, fd({ token: "tok", mode: "applicant" }))).rejects.toThrow("NEXT_REDIRECT:/requests");
    expect(lib.acceptInvite).toHaveBeenCalledWith({ db: true }, "tok", { applicantId: "a1" });
  });
  it("maps refusals to copy; a stale applicant session is told to sign in again", async () => {
    currentVisitor.mockResolvedValue(applicant);
    lib.acceptInvite.mockRejectedValue(new AdminError("VALIDATION", "This invite is for a***@gmail.com"));
    expect(await acceptInviteAction(null, fd({ token: "tok", mode: "applicant" }))).toMatchObject({ error: "This invite is for a***@gmail.com" });
    lib.acceptInvite.mockRejectedValue(new AdminError("FORBIDDEN", "This email belongs to a deactivated account. Contact your admin."));
    expect(await acceptInviteAction(null, fd({ token: "tok", mode: "applicant" }))).toMatchObject({ error: expect.stringContaining("Contact your admin.") });
    currentVisitor.mockResolvedValue({ kind: "none" });
    lib.acceptInvite.mockClear();
    expect(await acceptInviteAction(null, fd({ token: "tok", mode: "applicant" }))).toMatchObject({ error: "Your session ended — sign in again." });
    expect(lib.acceptInvite).not.toHaveBeenCalled();
  });
});

describe("LobbyPoll", () => {
  it("checks the session every 15 s and leaves for /requests once approved, and stops on unmount", async () => {
    vi.useFakeTimers();
    try {
      const { LobbyPoll } = await vi.importActual<typeof import("@/app/lobby/LobbyPoll")>("@/app/lobby/LobbyPoll");
      const fetchMock = vi.fn().mockResolvedValueOnce({ json: async () => ({ user: { applicantId: "a1" } }) })
        .mockResolvedValue({ json: async () => ({ user: { appRole: "REQUESTER" } }) });
      vi.stubGlobal("fetch", fetchMock);
      const go = vi.fn();
      const { unmount } = render(<LobbyPoll go={go} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
      expect(fetchMock).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.anything());
      expect(go).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(go).toHaveBeenCalledWith("/requests");
      unmount();
      const calls = fetchMock.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(fetchMock.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
