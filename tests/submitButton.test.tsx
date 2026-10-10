// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { SubmitButton } from "@/components/ui/SubmitButton";

afterEach(cleanup);

describe("SubmitButton", () => {
  it("is a submit button that shows the pending label, a spinner and blocks repeat clicks while the form submits", async () => {
    let finish = () => {};
    const action = () => new Promise<void>((r) => { finish = r; });
    render(<form action={action}><SubmitButton variant="primary" pendingLabel="Signing in…">Sign in</SubmitButton></form>);
    const btn = screen.getByRole("button", { name: "Sign in" });
    expect(btn.getAttribute("type")).toBe("submit");
    fireEvent.click(btn);
    const busy = await screen.findByRole("button", { name: "Signing in…" });
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish());
    expect(screen.getByRole("button", { name: "Sign in" }).hasAttribute("disabled")).toBe(false);
  });
});
