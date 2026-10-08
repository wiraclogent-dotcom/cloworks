// @vitest-environment jsdom
/** QA fix round 1, D4/D6: without a stored choice the sidebar is the rail from 768 to 1279.98px, by CSS only. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/requests" }));

import { AppFrame } from "@/components/shell/AppFrame";
import { RAIL_DEFAULT_QUERY, THEME_INIT_SCRIPT, sidebarIsCollapsed } from "@/lib/theme";

const css = fs.readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
const html = () => document.documentElement;
function mockWidth(rail: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q === RAIL_DEFAULT_QUERY ? rail : false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
beforeEach(() => { localStorage.clear(); html().removeAttribute("data-sidebar"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("CSS contract", () => {
  it("collapses with no attribute only inside the 768–1279.98px media query; stored choices use explicit values", () => {
    expect(RAIL_DEFAULT_QUERY).toBe("(min-width: 768px) and (max-width: 1279.98px)");
    const block = css.slice(css.indexOf("@media (min-width: 768px) and (max-width: 1279.98px)"));
    expect(block.slice(0, block.indexOf("@media (min-width: 1280px)"))).toMatch(/:root:not\(\[data-sidebar\]\) \.app-sidebar \{\s*width: 64px;/);
    expect(css).toMatch(/@media \(min-width: 1280px\) \{\s*:root:not\(\[data-sidebar\]\) \.app-sidebar \.sb-collapsed-only \{\s*display: none;/);
    expect(css).toContain(':root[data-sidebar="expanded"] .app-sidebar .sb-collapsed-only');
    expect(css).not.toContain(':root:not([data-sidebar="collapsed"])');
  });
});

describe("boot script and state", () => {
  it("restores collapsed and expanded, and leaves the attribute absent without a stored choice", () => {
    new Function(THEME_INIT_SCRIPT)();
    expect(html().hasAttribute("data-sidebar")).toBe(false);
    localStorage.setItem("ct-sidebar", "expanded");
    new Function(THEME_INIT_SCRIPT)();
    expect(html().getAttribute("data-sidebar")).toBe("expanded");
    localStorage.setItem("ct-sidebar", "weird");
    html().removeAttribute("data-sidebar");
    new Function(THEME_INIT_SCRIPT)();
    expect(html().hasAttribute("data-sidebar")).toBe(false);
  });
  it("sidebarIsCollapsed: stored choice wins, otherwise the width query decides", () => {
    mockWidth(true);
    expect(sidebarIsCollapsed()).toBe(true);
    html().setAttribute("data-sidebar", "expanded");
    expect(sidebarIsCollapsed()).toBe(false);
    html().removeAttribute("data-sidebar");
    mockWidth(false);
    expect(sidebarIsCollapsed()).toBe(false);
    html().setAttribute("data-sidebar", "collapsed");
    expect(sidebarIsCollapsed()).toBe(true);
  });
  it("the collapse button reflects the default rail (after hydration) and expanding stores an explicit choice", async () => {
    mockWidth(true);
    render(<AppFrame nav={null} footer={null}><p>x</p></AppFrame>);
    const btn = await screen.findByRole("button", { name: "Expand sidebar" });
    btn.click();
    await screen.findByRole("button", { name: "Collapse sidebar" });
    expect(html().getAttribute("data-sidebar")).toBe("expanded");
    expect(localStorage.getItem("ct-sidebar")).toBe("expanded");
  });
});
