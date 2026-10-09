// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
const open = () => {
  render(<ProfileMenuView name="Wira" roleLabel="Admin" signOut={signOut} />);
  const trigger = screen.getByRole("button", { name: "Account menu for Wira" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("menu");
};

describe("ProfileMenuView", () => {
  it("the trigger shows the person's initials and opens a menu", () => {
    render(<ProfileMenuView name="Wira" roleLabel="Admin" signOut={signOut} />);
    const trigger = screen.getByRole("button", { name: "Account menu for Wira" });
    expect(trigger.textContent).toBe("WI");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("lists name and role, Account settings, Help center, Dark mode and Sign out", () => {
    const menu = open();
    expect(menu.textContent).toContain("Wira");
    expect(menu.textContent).toContain("Admin");
    expect(screen.getByRole("menuitem", { name: "Account settings" }).getAttribute("href")).toBe("/settings");
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

  it("Sign out submits the sign-out form", () => {
    open();
    const item = screen.getByRole("menuitem", { name: "Sign out" });
    expect(item.closest("form")).toBeTruthy();
    expect(item.getAttribute("type")).toBe("submit");
  });
});
