// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, within, waitFor } from "@testing-library/react";

let pathname = "/requests/new";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { AppFrame } from "@/components/shell/AppFrame";
import { NavItem } from "@/components/shell/NavItem";

const html = () => document.documentElement;
function shell() {
  return render(
    <AppFrame
      nav={<nav aria-label="Main"><ul>
        <NavItem href="/requests" label="Requests" icon={<svg aria-hidden="true" />} />
        <NavItem href="/projects" label="Projects" icon={<svg aria-hidden="true" />} />
        <NavItem href="/dashboard" label="My KPI" icon={<svg aria-hidden="true" />} />
        <NavItem href="/dashboard/team" label="Team KPI" icon={<svg aria-hidden="true" />} />
      </ul></nav>}
      footer={<button type="button">Sign out</button>}>
      <h1>Page</h1>
    </AppFrame>,
  );
}

beforeEach(() => { pathname = "/requests/new"; localStorage.clear(); html().removeAttribute("data-sidebar"); });
afterEach(cleanup);

describe("AppFrame / sidebar shell", () => {
  it("has a skip link to <main id=main> and a labelled main nav", () => {
    shell();
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main");
    const main = screen.getByRole("main");
    expect(main.id).toBe("main");
    expect(within(main).getByRole("heading", { name: "Page" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });

  it("marks only the current route with aria-current=page (longest match)", () => {
    shell();
    expect(screen.getByRole("link", { name: "Requests" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Projects" }).getAttribute("aria-current")).toBeNull();
    cleanup();
    pathname = "/dashboard/team";
    shell();
    expect(screen.getByRole("link", { name: "Team KPI" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "My KPI" }).getAttribute("aria-current")).toBeNull();
  });

  it("collapses to the icon rail: aria-expanded, remembered in ct-sidebar, tooltips on items", async () => {
    shell();
    const btn = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    // The tooltip title is unconditional (never depends on the rail state: hydration safety).
    expect(screen.getByRole("link", { name: "Projects" }).getAttribute("title")).toBe("Projects");
    await act(async () => { fireEvent.click(btn); });
    expect(html().getAttribute("data-sidebar")).toBe("collapsed");
    expect(localStorage.getItem("ct-sidebar")).toBe("collapsed");
    const expand = await screen.findByRole("button", { name: "Expand sidebar" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    // Labels stay in the accessible name; the title gives sighted users a tooltip.
    expect(screen.getByRole("link", { name: "Projects" }).getAttribute("title")).toBe("Projects");
    await act(async () => { fireEvent.click(expand); });
    // An explicit "expanded" (not a removed attribute): the user's choice must beat the < 1280px rail default.
    expect(html().getAttribute("data-sidebar")).toBe("expanded");
    expect(localStorage.getItem("ct-sidebar")).toBe("expanded");
  });

  // The drawer is a shadcn Sheet (side="left", a Radix modal dialog) since the shadcn-first migration; it was the
  // desktop <aside> slid in with a hand-made backdrop, inert and focus code. The user contract is unchanged.
  it("mobile drawer opens from the menu button, traps focus, closes on Esc and returns focus", async () => {
    shell();
    const burger = screen.getByRole("button", { name: "Open navigation" });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(burger);
    expect(burger.getAttribute("aria-expanded")).toBe("true");
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(drawer.getAttribute("data-side")).toBe("left");
    expect(document.getElementById(burger.getAttribute("aria-controls")!)).toBe(drawer);
    // The sidebar's parts live in the drawer while it is open (not twice on the page).
    expect(within(drawer).getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(document.querySelectorAll("nav[aria-label='Main']")).toHaveLength(1);
    const close = within(drawer).getByRole("button", { name: "Close navigation" });
    expect(document.activeElement).toBe(close);
    expect(document.getElementById("main")!.hasAttribute("inert")).toBe(true);
    // Focus is trapped: Shift+Tab from the first control wraps to the last one inside the drawer.
    await act(async () => { fireEvent.keyDown(close, { key: "Tab", shiftKey: true }); });
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: "Escape" }); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    // Radix returns focus on the next tick.
    await waitFor(() => expect(document.activeElement).toBe(burger));
    expect(document.getElementById("main")!.hasAttribute("inert")).toBe(false);
    expect(document.querySelectorAll("nav[aria-label='Main']")).toHaveLength(1);
  });

  it("mobile drawer: a backdrop click and the close button both close it", async () => {
    shell();
    const burger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(burger);
    // Radix starts listening for outside pointer-downs on the tick after the drawer mounts.
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const backdrop = document.querySelector("[data-slot='sheet-overlay']")!;
    expect(backdrop).toBeTruthy();
    await act(async () => { fireEvent.pointerDown(backdrop); fireEvent.click(backdrop); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(burger);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Close navigation" })); });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[data-slot='sheet-overlay']")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(burger));
  });

  it("mobile drawer: following a link closes it", async () => {
    shell();
    const burger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(burger);
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Projects" })); });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the drawer is never in the server HTML, and the desktop sidebar is CSS-hidden below 768px", async () => {
    const { renderToString } = await import("react-dom/server");
    const markup = renderToString(
      <AppFrame nav={<nav aria-label="Main"><ul><li>x</li></ul></nav>} footer={null}><p>x</p></AppFrame>,
    );
    expect(markup).not.toMatch(/role="dialog"|data-slot="sheet-(content|overlay)"/);
    const aside = new DOMParser().parseFromString(markup, "text/html").getElementById("app-sidebar")!;
    expect(aside.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "md:flex", "app-sidebar"]));
    expect(aside.querySelector("nav[aria-label='Main']")).toBeTruthy();
  });
});
