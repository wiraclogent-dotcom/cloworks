// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ signIn: vi.fn() }));
import SignInPage from "@/app/signin/page";
import { signInErrorMessage, DENIED_MESSAGE, FAILED_MESSAGE } from "@/lib/signinError";

afterEach(cleanup);

describe("signInErrorMessage", () => {
  it("maps AccessDenied, everything else generic, nothing for no error", () => {
    expect(signInErrorMessage("AccessDenied")).toBe(DENIED_MESSAGE);
    expect(signInErrorMessage(["AccessDenied", "x"])).toBe(DENIED_MESSAGE);
    for (const c of ["Configuration", "Verification", "OAuthCallback", "<script>alert(1)</script>", "accessdenied"]) expect(signInErrorMessage(c)).toBe(FAILED_MESSAGE);
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
  });
});

describe("SignInPage", () => {
  const show = async (error?: string) => render(await SignInPage({ searchParams: Promise.resolve({ error }) }));
  it("renders an alert for a refused login", async () => {
    await show("AccessDenied");
    expect(screen.getByRole("alert").textContent).toBe(DENIED_MESSAGE);
  });
  it("renders the generic line for unknown codes and never echoes them", async () => {
    await show("weird<b>code");
    expect(screen.getByRole("alert").textContent).toBe(FAILED_MESSAGE);
    expect(document.body.textContent).not.toContain("weird");
  });
  it("renders no alert without an error", async () => {
    await show(undefined);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
  });
});
