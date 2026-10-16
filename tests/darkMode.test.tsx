// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ThemeSync, useDarkMode } from "@/components/ui/darkMode";
import { LightOnly } from "@/components/landing/LightOnly";
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
    window.history.replaceState(null, "", "/requests");
    localStorage.setItem("ct-theme", "dark");
    runBootScript();
    expect(html().getAttribute("data-theme")).toBe("dark");
    localStorage.setItem("ct-theme", "system");
    mockMatchMedia(true);
    runBootScript();
    expect(html().getAttribute("data-theme")).toBe("dark");
    window.history.replaceState(null, "", "/");
  });
  it("keeps the landing page light whatever the stored choice", () => {
    window.history.replaceState(null, "", "/");
    localStorage.setItem("ct-theme", "dark");
    runBootScript();
    expect(html().getAttribute("data-theme")).toBe("light");
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

/** Smallest consumer of the hook: what the profile menu's Dark mode item does. */
function Probe() {
  const { dark, flip } = useDarkMode();
  return <button type="button" role="switch" aria-checked={dark} onClick={flip}>Dark mode</button>;
}
const sw = () => screen.getByRole("switch", { name: "Dark mode" });

describe("useDarkMode + ThemeSync", () => {
  it("starts off (day) with no stored choice", () => {
    render(<Probe />);
    expect(sw().getAttribute("aria-checked")).toBe("false");
  });

  it("flipping to night stores dark and switches <html data-theme>; flipping back stores light", () => {
    render(<Probe />);
    fireEvent.click(sw());
    expect(localStorage.getItem("ct-theme")).toBe("dark");
    expect(html().getAttribute("data-theme")).toBe("dark");
    expect(sw().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw());
    expect(localStorage.getItem("ct-theme")).toBe("light");
    expect(html().getAttribute("data-theme")).toBe("light");
  });

  it("flips softly through a View Transition when the browser has one, marking <html> only while it runs", async () => {
    let done!: () => void;
    const finished = new Promise<void>((r) => { done = r; });
    const start = vi.fn((cb: () => void) => { cb(); return { finished }; });
    Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
    try {
      render(<Probe />);
      fireEvent.click(sw());
      expect(start).toHaveBeenCalledOnce();
      expect(html().getAttribute("data-theme")).toBe("dark");
      expect(html().hasAttribute("data-theme-switch")).toBe(true);
      done();
      await finished; await Promise.resolve();
      expect(html().hasAttribute("data-theme-switch")).toBe(false);
    } finally {
      delete (document as { startViewTransition?: unknown }).startViewTransition;
    }
  });

  it("switches instantly, without a View Transition, when reduced motion is asked for", () => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("reduced-motion"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const start = vi.fn();
    Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
    try {
      render(<Probe />);
      fireEvent.click(sw());
      expect(start).not.toHaveBeenCalled();
      expect(html().getAttribute("data-theme")).toBe("dark");
    } finally {
      delete (document as { startViewTransition?: unknown }).startViewTransition;
    }
  });

  it("a stored system choice still follows the OS (via ThemeSync), and flipping replaces it with light or dark", () => {
    mockMatchMedia(true);
    localStorage.setItem("ct-theme", "system");
    render(<><ThemeSync /><Probe /></>);
    expect(html().getAttribute("data-theme")).toBe("dark");
    expect(sw().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw());
    expect(localStorage.getItem("ct-theme")).toBe("light");
    expect(html().getAttribute("data-theme")).toBe("light");
  });

  it("still switches when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<Probe />);
    fireEvent.click(sw());
    expect(html().getAttribute("data-theme")).toBe("dark");
    spy.mockRestore();
  });
});

describe("<LightOnly> (landing page)", () => {
  it("paints the page light while mounted and hands back the stored choice on the way out", () => {
    localStorage.setItem("ct-theme", "dark");
    html().setAttribute("data-theme", "dark");
    const { unmount } = render(<LightOnly />);
    expect(html().getAttribute("data-theme")).toBe("light");
    unmount();
    expect(html().getAttribute("data-theme")).toBe("dark");
  });
});
