// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/app/signin/actions", () => ({ passwordSignIn: vi.fn(), googleSignIn: vi.fn() }));
vi.mock("next/font/google", () => ({ Bricolage_Grotesque: () => ({ variable: "font-display" }) }));
import { PasswordInput } from "@/components/ui/PasswordInput";
import SignInPage from "@/app/signin/page";

afterEach(() => cleanup());

describe("PasswordInput (show-password toggle, R16)", () => {
  it("toggles between password and text with an accessible, non-submitting button", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" name="password" autoComplete="current-password" required />
      </form>,
    );
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.name).toBe("password");
    expect(input.required).toBe(true);
    const btn = screen.getByRole("button", { name: "Show password" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.tabIndex).not.toBe(-1);
    fireEvent.click(btn);
    expect(input.type).toBe("text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(hide);
    expect(input.type).toBe("password");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("sign-in page", () => {
  it("has a show-password toggle and an unchecked Remember me box posting remember=1", async () => {
    await act(async () => { render(<SignInPage searchParams={Promise.resolve({})} />); });
    expect(screen.getByRole("button", { name: "Show password" })).toBeTruthy();
    const box = screen.getByLabelText("Remember me") as HTMLInputElement;
    expect(box.type).toBe("checkbox");
    expect(box.checked).toBe(false);
    expect(box.name).toBe("remember");
    expect(box.value).toBe("1");
    expect(box.closest("form")?.querySelector('input[name="password"]')).toBeTruthy();
  });
});
