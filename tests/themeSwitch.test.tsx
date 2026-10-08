// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";
import { THEME_INIT_SCRIPT, parseThemePref, resolveTheme } from "@/lib/theme";

function mockMatchMedia(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("dark") ? dark : false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
const html = () => document.documentElement;
const runBootScript = () => new Function(THEME_INIT_SCRIPT)();

beforeEach(() => { localStorage.clear(); html().removeAttribute("data-theme"); html().removeAttribute("data-sidebar"); mockMatchMedia(false); });
afterEach(cleanup);

describe("theme preference helpers", () => {
  it("defaults to light for missing or unknown values", () => {
    expect(parseThemePref(null)).toBe("light");
    expect(parseThemePref("purple")).toBe("light");
    expect(parseThemePref("dark")).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("boot script (runs before first paint)", () => {
  it("sets light without a stored choice, even when the OS is dark", () => {
    mockMatchMedia(true);
    runBootScript();
    expect(html().getAttribute("data-theme")).toBe("light");
  });
  it("applies a stored dark choice and resolves system from the OS", () => {
    localStorage.setItem("ct-theme", "dark");
    runBootScript();
    expect(html().getAttribute("data-theme")).toBe("dark");
    localStorage.setItem("ct-theme", "system");
    mockMatchMedia(true);
    runBootScript();
    expect(html().getAttribute("data-theme")).toBe("dark");
  });
  it("restores the collapsed sidebar and never throws when storage is blocked", () => {
    localStorage.setItem("ct-sidebar", "collapsed");
    runBootScript();
    expect(html().getAttribute("data-sidebar")).toBe("collapsed");
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => runBootScript()).not.toThrow();
    spy.mockRestore();
  });
});

describe("ThemeSwitch", () => {
  it("is a labelled group of three toggle buttons; Light is pressed by default", () => {
    render(<ThemeSwitch />);
    const group = screen.getByRole("group", { name: "Theme" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "System" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("choosing Dark stores ct-theme and switches <html data-theme> immediately", () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(localStorage.getItem("ct-theme")).toBe("dark");
    expect(html().getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(html().getAttribute("data-theme")).toBe("light");
  });

  it("System follows the OS setting and the attribute stays light|dark", () => {
    mockMatchMedia(true);
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(localStorage.getItem("ct-theme")).toBe("system");
    expect(html().getAttribute("data-theme")).toBe("dark");
  });

  it("still switches when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(html().getAttribute("data-theme")).toBe("dark");
    spy.mockRestore();
  });

  it("buttons are native <button>s (keyboard operable) and the sidebar variant adds a cycle button for the rail", () => {
    render(<ThemeSwitch tone="sidebar" />);
    for (const b of screen.getAllByRole("button")) expect(b.tagName).toBe("BUTTON");
    const cycle = screen.getByRole("button", { name: /^Theme: Light\. Switch to Dark$/ });
    fireEvent.click(cycle);
    expect(html().getAttribute("data-theme")).toBe("dark");
  });
});
