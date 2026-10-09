// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/app/signin/actions", () => ({ passwordSignIn: vi.fn() }));
import SignInPage from "@/app/signin/page";
import { signInErrorMessage, CREDENTIALS_MESSAGE, DENIED_MESSAGE, FAILED_MESSAGE, PASSWORD_CHANGED_MESSAGE } from "@/lib/signinError";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("signInErrorMessage", () => {
  it("maps AccessDenied, everything else generic, nothing for no error", () => {
    expect(signInErrorMessage("AccessDenied")).toBe(DENIED_MESSAGE);
    expect(signInErrorMessage(["AccessDenied", "x"])).toBe(DENIED_MESSAGE);
    for (const c of ["Configuration", "Verification", "OAuthCallback", "<script>alert(1)</script>", "accessdenied"]) expect(signInErrorMessage(c)).toBe(FAILED_MESSAGE);
    expect(signInErrorMessage("CredentialsSignin")).toBe(CREDENTIALS_MESSAGE);
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
  });
});

describe("SignInPage", () => {
  const show = async (error?: string, changed?: string) => {
    await act(async () => { render(<SignInPage searchParams={Promise.resolve({ error, changed })} />); });
  };
  it("renders an alert for a refused login", async () => {
    await show("AccessDenied");
    expect((await screen.findByRole("alert")).textContent).toBe(DENIED_MESSAGE);
  });
  it("renders the generic line for unknown codes and never echoes them", async () => {
    await show("weird<b>code");
    expect((await screen.findByRole("alert")).textContent).toBe(FAILED_MESSAGE);
    expect(document.body.textContent).not.toContain("weird");
  });
  it("renders no alert without an error, and always offers email + password", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "");
    await show(undefined);
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).type).toBe("email");
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue with/i })).toBeNull();
  });
  it("shows only the OAuth buttons whose provider is configured", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "eid");
    await show(undefined);
    expect(screen.getByRole("button", { name: /continue with microsoft/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
  });
  it("explains a refused password sign-in, and confirms a password change", async () => {
    await show("CredentialsSignin");
    expect((await screen.findByRole("alert")).textContent).toBe(CREDENTIALS_MESSAGE);
    cleanup();
    await show(undefined, "1");
    expect((await screen.findByRole("status")).textContent).toBe(PASSWORD_CHANGED_MESSAGE);
  });
});
