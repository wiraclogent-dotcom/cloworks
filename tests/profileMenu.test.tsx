// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ProfileMenuView } from "@/components/shell/ProfileMenuView";

// jsdom lacks these; Radix's menu positioning and focus handling call them.
class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(cleanup);

const signOut = vi.fn(async () => {});
const me = { name: "Wira", title: "Creative Lead", department: "Marketing", roleLabel: "Admin" };
const open = () => {
  render(<ProfileMenuView {...me} signOut={signOut} />);
  const trigger = screen.getByRole("button", { name: "Account menu for Wira" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("menu");
};

describe("ProfileMenuView", () => {
  it("the trigger is a card with the person's initials, name, title and department, and opens a menu", () => {
    render(<ProfileMenuView {...me} signOut={signOut} />);
    const trigger = screen.getByRole("button", { name: "Account menu for Wira" });
    expect(trigger.textContent).toBe("WIWiraCreative Lead · Marketing");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("the card falls back to the app role when title and department are empty", () => {
    render(<ProfileMenuView {...me} title={null} department="" signOut={signOut} />);
    expect(screen.getByRole("button", { name: "Account menu for Wira" }).textContent).toBe("WIWiraAdmin");
  });

  it("lists Settings, Help center, Dark mode and Sign out", () => {
    open();
    expect(screen.getByRole("menuitem", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("menuitem", { name: "Help center" }).getAttribute("href")).toBe("/help");
    expect(screen.getByRole("menuitemcheckbox", { name: "Dark mode" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("Dark mode switches the theme", () => {
    open();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Dark mode" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("ct-theme")).toBe("dark");
  });

  // Regression: the item used to be a submit button inside a <form>; choosing it closed the menu, which unmounted the
  // form before the browser submitted it ("Form submission canceled because the form is not connected").
  it("choosing Sign out calls the sign-out action and shows it is working", async () => {
    signOut.mockClear();
    let finish = () => {};
    signOut.mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }));
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    const busy = await screen.findByRole("menuitem", { name: "Signing out…" });
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    await act(async () => finish());
  });
});
