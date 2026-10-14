// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { fieldClass } from "@/components/ui/Field";

class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
});
afterEach(cleanup);

const root = path.resolve(__dirname, "..");
const src = (p: string) => readFileSync(path.join(root, "src/components/shadcn", p), "utf8");
// Utilities fieldClass sets for a block-level text input that a flex trigger deliberately replaces.
const LAYOUT_ONLY = new Set(["block", "w-full", "pr-8"]);

function tokens(cls: string) { return cls.split(/\s+/).filter(Boolean); }

describe("Select trigger matches fieldClass()", () => {
  for (const [size, shadcnSize] of [["md", "default"], ["sm", "sm"]] as const) {
    it(`carries every fieldClass token (size ${size})`, () => {
      render(
        <Select>
          <SelectTrigger size={shadcnSize} aria-label="Pick"><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent><SelectItem value="a">A</SelectItem></SelectContent>
        </Select>,
      );
      const have = new Set(tokens(screen.getByRole("combobox", { name: "Pick" }).className));
      const missing = tokens(fieldClass({ size })).filter((t) => !LAYOUT_ONLY.has(t) && !have.has(t));
      expect(missing).toEqual([]);
    });
  }

  it("placeholder and invalid use the app tokens, chevron is secondary text", () => {
    const { container } = render(
      <Select>
        <SelectTrigger aria-label="Pick" aria-invalid><SelectValue placeholder="Choose" /></SelectTrigger>
        <SelectContent><SelectItem value="a">A</SelectItem></SelectContent>
      </Select>,
    );
    const trigger = screen.getByRole("combobox", { name: "Pick" });
    expect(trigger.className).toContain("data-[placeholder]:text-placeholder");
    expect(trigger.className).toContain("aria-invalid:border-danger");
    expect(trigger.className).not.toMatch(/border-destructive|text-muted-foreground|rounded-md/);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("text-foreground-secondary");
  });

  it("content and items use the popover surface and muted hover; the selected item is medium weight", () => {
    render(
      <Select defaultValue="a">
        <SelectTrigger aria-label="Pick"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="a">A</SelectItem><SelectItem value="b">B</SelectItem></SelectContent>
      </Select>,
    );
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Pick" }), { key: "Enter" });
    const list = screen.getByRole("listbox").closest("[data-slot=select-content]")!;
    for (const t of ["bg-popover", "border-border", "shadow-raised", "rounded-lg"]) expect(list.className).toContain(t);
    const opt = screen.getAllByRole("option")[0];
    expect(opt.className).toContain("focus:bg-surface-muted");
    expect(opt.className).toContain("data-[state=checked]:font-medium");
    expect(opt.className).toMatch(/data-\[highlighted\]:bg-surface-muted|focus:bg-surface-muted/);
  });
});

describe("open/close animations use the app's keyframes", () => {
  for (const f of ["select.tsx", "popover.tsx"]) {
    it(`${f} has no tw-animate-css utilities (that package is not installed)`, () => {
      const s = src(f);
      expect(s).not.toMatch(/animate-in|animate-out|fade-in|fade-out|zoom-in|zoom-out|slide-in-from|slide-out-to/);
      expect(s).toContain("data-[state=open]:animate-pop-in");
      expect(s).not.toMatch(/data-\[state=open\]:animate-pop(?!-)/);
      expect(s).toContain("data-[state=closed]:animate-pop-out");
    });
  }
  it("globals.css defines animate-pop-out and covers it under prefers-reduced-motion", () => {
    const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
    // @utility (not a plain class) so `data-[state=open]:animate-pop` variants are generated.
    expect(css).toMatch(/@utility animate-pop-out\s*\{/);
    expect(css).toMatch(/@utility animate-pop\s*\{/);
    expect(css).toMatch(/@utility animate-pop-in\s*\{[^}]*0\.1[0-9]*s/);
    expect(css).toMatch(/@keyframes pop-in/);
    expect(css).toMatch(/@keyframes pop-out/);
    // The blanket reduced-motion rule shortens every animation, so Radix Presence still unmounts on time.
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\*,/);
  });
});
