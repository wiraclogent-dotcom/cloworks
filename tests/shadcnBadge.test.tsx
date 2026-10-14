// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Badge } from "@/components/shadcn/badge";
import { BrandTag } from "@/components/ui/BrandTag";
import { StatusChip } from "@/components/ui/StatusChip";

afterEach(cleanup);

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
const noHex = (el: Element) => expect(el.outerHTML).not.toMatch(/#[0-9a-f]{6}|text-white|bg-white|text-black/i);

describe("Badge", () => {
  it("carries its palette tone and uses tone tokens only", () => {
    render(<Badge tone="due-soon">Soon</Badge>);
    const c = screen.getByText("Soon");
    expect(c.tagName).toBe("SPAN");
    expect(c.getAttribute("data-tone")).toBe("due-soon");
    expect(tokens(c)).toEqual(expect.arrayContaining(["rounded-md", "bg-tone-tint", "text-tone-text", "px-2", "py-0.5", "text-xs", "font-medium", "max-w-full", "whitespace-nowrap"]));
    noHex(c);
  });

  it("defaults to the neutral tag tone", () => {
    render(<Badge>Role</Badge>);
    expect(screen.getByText("Role").getAttribute("data-tone")).toBe("tag-neutral");
  });

  it("passes data-* and aria-* attributes and className through", () => {
    render(<Badge tone="done" data-role="DESIGNER" className="tabular-nums">Designer</Badge>);
    const c = screen.getByText("Designer");
    expect(c.getAttribute("data-role")).toBe("DESIGNER");
    expect(tokens(c)).toContain("tabular-nums");
  });

  it("count variant is a full-radius muted pill with tabular numbers and no tone", () => {
    render(<Badge variant="count" aria-label="7 requests">{7}</Badge>);
    const p = screen.getByLabelText("7 requests");
    expect(p.textContent).toBe("7");
    expect(tokens(p)).toEqual(expect.arrayContaining(["rounded-full", "bg-muted", "text-muted-foreground", "tabular-nums", "min-w-6"]));
    expect(p.hasAttribute("data-tone")).toBe(false);
    expect(tokens(p)).not.toContain("bg-tone-tint");
  });

  it("className overrides the count background (a count on a muted header)", () => {
    render(<Badge variant="count" aria-label="3" className="bg-card">3</Badge>);
    const have = tokens(screen.getByLabelText("3"));
    expect(have).toContain("bg-card");
    expect(have).not.toContain("bg-muted");
  });

  it("sizes an icon child to 14px and does not shrink it", () => {
    render(<Badge><svg data-testid="i" aria-hidden="true" />Label</Badge>);
    const have = tokens(screen.getByText("Label"));
    expect(have).toContain("[&_svg]:size-3.5");
    expect(have).toContain("[&_svg]:shrink-0");
  });

  it("asChild puts the badge on the child element", () => {
    render(<Badge asChild tone="done"><a href="/x">Open</a></Badge>);
    const a = screen.getByRole("link", { name: "Open" });
    expect(a.getAttribute("data-tone")).toBe("done");
    expect(tokens(a)).toContain("bg-tone-tint");
  });
});

describe("BrandTag", () => {
  it("picks the brand tone, unknown brands neutral", () => {
    render(<><BrandTag name="Clogent" /><BrandTag name="Bubble Wash" /><BrandTag name="Acme" /></>);
    expect(screen.getByText("Clogent").getAttribute("data-tone")).toBe("tag-clogent");
    expect(screen.getByText("Bubble Wash").getAttribute("data-tone")).toBe("tag-bubble-wash");
    expect(screen.getByText("Acme").getAttribute("data-tone")).toBe("tag-neutral");
  });

  it("takes a className", () => {
    render(<BrandTag name="Clogent" className="hidden lg:inline-flex" />);
    expect(tokens(screen.getByText("Clogent"))).toContain("hidden");
  });
});

describe("StatusChip", () => {
  it("StatusChip renders a Badge with icon + label", () => {
    render(<StatusChip status="ON_PROGRESS" />);
    const chip = screen.getByText("On progress");
    expect(chip.getAttribute("data-slot")).toBe("badge");
    expect(chip.getAttribute("data-tone")).toBe("in-progress");
    expect(chip.querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });
});
