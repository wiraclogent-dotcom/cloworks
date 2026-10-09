// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ThemeSwitch, ThemeSync } from "@/components/ui/ThemeSwitch";
import { THEME_INIT_SCRIPT, parseThemePref, resetThemeMemory, resolveTheme } from "@/lib/theme";

function mockMatchMedia(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("dark") ? dark : false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
const html = () => document.documentElement;
const runBootScript = () => new Function(THEME_INIT_SCRIPT)();

beforeEach(() => { localStorage.clear(); resetThemeMemory(); html().removeAttribute("data-theme"); html().removeAttribute("data-sidebar"); mockMatchMedia(false); });
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

describe("ThemeSwitch (day / night toggle)", () => {
  it("is a switch labelled Dark mode; it starts off (day) with no stored choice", () => {
    render(<ThemeSwitch />);
    const sw = screen.getAllByRole("switch", { name: "Dark mode" })[0];
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  it("flipping to night stores dark and switches <html data-theme>; flipping back stores light", () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getAllByRole("switch", { name: "Dark mode" })[0]);
    expect(localStorage.getItem("ct-theme")).toBe("dark");
    expect(html().getAttribute("data-theme")).toBe("dark");
    expect(screen.getAllByRole("switch", { name: "Dark mode" })[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getAllByRole("switch", { name: "Dark mode" })[0]);
    expect(localStorage.getItem("ct-theme")).toBe("light");
    expect(html().getAttribute("data-theme")).toBe("light");
  });

  it("never offers a System option", () => {
    render(<ThemeSwitch />);
    expect(screen.queryByRole("button", { name: "System" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Theme" })).toBeNull();
  });

  it("a stored system choice still follows the OS, and flipping replaces it with light or dark", () => {
    mockMatchMedia(true);
    localStorage.setItem("ct-theme", "system");
    // The app shell mounts ThemeSync once (it applies a "system" choice); the switch only reads and flips.
    render(<><ThemeSync /><ThemeSwitch /></>);
    expect(html().getAttribute("data-theme")).toBe("dark");
    expect(screen.getAllByRole("switch", { name: "Dark mode" })[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getAllByRole("switch", { name: "Dark mode" })[0]);
    expect(localStorage.getItem("ct-theme")).toBe("light");
    expect(html().getAttribute("data-theme")).toBe("light");
  });

  it("still switches when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<ThemeSwitch />);
    fireEvent.click(screen.getAllByRole("switch", { name: "Dark mode" })[0]);
    expect(html().getAttribute("data-theme")).toBe("dark");
    spy.mockRestore();
  });

  it("the collapsed rail has a round icon switch that flips the same way", () => {
    render(<ThemeSwitch tone="sidebar" />);
    const switches = screen.getAllByRole("switch", { name: "Dark mode" });
    expect(switches).toHaveLength(2);
    for (const b of switches) expect(b.tagName).toBe("BUTTON");
    fireEvent.click(switches[1]);
    expect(html().getAttribute("data-theme")).toBe("dark");
  });
});
