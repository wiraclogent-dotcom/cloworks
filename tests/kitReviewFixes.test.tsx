// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { cn } from "@/components/ui/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Button, buttonClass } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { fieldClass } from "@/components/ui/Field";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";
import { readThemePref, resetThemeMemory, setThemePref } from "@/lib/theme";

beforeEach(() => { localStorage.clear(); resetThemeMemory(); document.documentElement.removeAttribute("data-theme"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("cn() resolves Tailwind conflicts (tailwind-merge, last wins)", () => {
  it.each([
    [["h-9 px-4", "h-10"], "px-4 h-10"],
    [["size-8", "size-9"], "size-9"],
    [["bg-surface", "bg-sidebar-hover"], "bg-sidebar-hover"],
    [["text-foreground-secondary", "text-sidebar-foreground"], "text-sidebar-foreground"],
    [["border-input", "border-danger"], "border-danger"],
    [["shadow-card", "shadow-raised"], "shadow-raised"],
    [["rounded-md", "rounded-full"], "rounded-full"],
    [["text-sm", "text-[13px]"], "text-[13px]"],
  ])("%j → %s", (parts, out) => {
    expect(cn(...parts)).toBe(out);
  });
  it("keeps non-conflicting token colour + size classes and skips falsy values", () => {
    expect(cn("text-foreground", false, "text-[13px]", null, undefined, 0)).toBe("text-foreground text-[13px]");
    expect(cn("text-xs", "text-tone-text")).toBe("text-xs text-tone-text");
  });
  it("a className override on a kit component replaces the default", () => {
    expect(buttonClass({ className: "h-10" })).not.toMatch(/\bh-9\b/);
    expect(fieldClass({ className: "h-8" }).split(" ")).not.toContain("h-9");
  });
});

describe("placeholders use the AA placeholder token", () => {
  it("fieldClass uses placeholder:text-placeholder", () => {
    expect(fieldClass()).toContain("placeholder:text-placeholder");
    expect(fieldClass()).not.toContain("foreground-muted");
  });
});

describe("ThemeSwitch when storage is blocked", () => {
  it("keeps an in-memory preference so aria-pressed matches the applied theme", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<ThemeSwitch />);
    fireEvent.click(screen.getAllByRole("switch", { name: "Dark mode" })[0]);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getAllByRole("switch", { name: "Dark mode" })[0].getAttribute("aria-checked")).toBe("true");
    expect(readThemePref()).toBe("dark");
  });
  it("storage working again: the stored value is the truth", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    setThemePref("system");
    expect(readThemePref()).toBe("system");
    spy.mockRestore();
    setThemePref("dark");
    expect(localStorage.getItem("ct-theme")).toBe("dark");
    localStorage.setItem("ct-theme", "light"); // e.g. another tab
    expect(readThemePref()).toBe("light");
  });
});

describe("Avatar / touch targets", () => {
  it("an empty name is hidden, never role=img with an empty label", () => {
    const { container } = render(<Avatar name="" />);
    const el = container.firstElementChild!;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.hasAttribute("aria-label")).toBe(false);
    expect(el.hasAttribute("role")).toBe(false);
    expect(el.hasAttribute("title")).toBe(false);
    cleanup();
    render(<Avatar name="Rina" />);
    expect(screen.getByRole("img", { name: "Rina" })).toBeTruthy();
  });
  it("sm buttons and icon buttons extend their hit area to 36px; theme options are 36px", () => {
    render(<><Button size="sm">Go</Button><IconButton size="sm" aria-label="More" icon={<svg />} /><ThemeSwitch tone="sidebar" /></>);
    expect(screen.getByRole("button", { name: "Go" }).className).toMatch(/after:-inset-y-0\.5/);
    expect(screen.getByRole("button", { name: "More" }).className).toMatch(/after:-inset-0\.5/);
    // The day/night switch sits in a 36px row (the track itself is 32px).
    expect(screen.getAllByRole("switch", { name: "Dark mode" })[0].parentElement!.className).toMatch(/\bh-9\b/);
  });
});
