// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";

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

  it("mobile drawer: opens from the hamburger, focus moves in, Escape closes and returns focus", () => {
    shell();
    const burger = screen.getByRole("button", { name: "Open navigation" });
    expect(burger.getAttribute("aria-controls")).toBe("app-sidebar");
    fireEvent.click(burger);
    expect(burger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close navigation" }));
    expect(document.getElementById("main")!.hasAttribute("inert")).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(burger);
    expect(document.getElementById("main")!.hasAttribute("inert")).toBe(false);
  });

  it("mobile drawer: backdrop click and the close button both close it; body scroll is never locked", () => {
    shell();
    const burger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(burger);
    expect(document.body.style.overflow).toBe("");
    fireEvent.click(screen.getByTestId("sidebar-backdrop"));
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(burger);
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("sidebar-backdrop")).toBeNull();
  });

  it("mobile drawer: following a link closes it", () => {
    shell();
    const burger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(burger);
    fireEvent.click(screen.getByRole("link", { name: "Projects" }));
    expect(burger.getAttribute("aria-expanded")).toBe("false");
  });
});
