// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Plus, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/shadcn/button";

afterEach(cleanup);

describe("shadcn Button", () => {
  it("defaults to type=button, so it never submits a form by accident", () => {
    const spy = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={spy}>
        <Button variant="outline">Plain</Button>
        <Button variant="default" type="submit">Send</Button>
      </form>,
    );
    expect(screen.getByRole("button", { name: "Plain" }).getAttribute("type")).toBe("button");
    fireEvent.click(screen.getByRole("button", { name: "Plain" }));
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it("maps variants to the kit look", () => {
    render(
      <>
        <Button variant="default">A</Button>
        <Button variant="outline">B</Button>
        <Button variant="ghost">C</Button>
        <Button variant="destructive">D</Button>
        <Button variant="secondary">E</Button>
        <Button variant="link">F</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "A" }).className).toMatch(/bg-primary/);
    const outline = screen.getByRole("button", { name: "B" }).className;
    expect(outline).toMatch(/border-border-strong/);
    expect(outline).toMatch(/bg-card/);
    expect(screen.getByRole("button", { name: "C" }).className).toMatch(/text-muted-foreground/);
    expect(screen.getByRole("button", { name: "D" }).className).toMatch(/bg-destructive/);
    expect(screen.getByRole("button", { name: "E" }).className).toMatch(/bg-muted/);
    expect(screen.getByRole("button", { name: "F" }).className).toMatch(/text-link/);
    expect(screen.getByRole("button", { name: "A" }).className).toMatch(/focus-visible:outline-ring/);
  });

  it("sizes: 36px default, 32px sm with a 36px hit area, square icon sizes", () => {
    render(
      <>
        <Button variant="outline">Def</Button>
        <Button variant="outline" size="sm">Small</Button>
        <Button variant="ghost" size="icon" aria-label="Icon" />
        <Button variant="ghost" size="icon-sm" aria-label="Icon small" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Def" }).className).toMatch(/\bh-9\b/);
    const sm = screen.getByRole("button", { name: "Small" }).className;
    expect(sm).toMatch(/\bh-8\b/);
    expect(sm).toMatch(/after:-inset-y-0\.5/);
    expect(screen.getByRole("button", { name: "Icon" }).className).toMatch(/\bsize-9\b/);
    expect(screen.getByRole("button", { name: "Icon small" }).className).toMatch(/\bsize-8\b/);
    // Icon buttons draw an 18px glyph; the 16px default must not survive next to it.
    const icon = screen.getByRole("button", { name: "Icon" }).className;
    expect(icon).toContain("[&_svg]:size-[18px]");
    expect(icon).not.toContain("[&_svg]:size-4");
  });

  it("loading shows a spinner, sets aria-busy, disables, keeps the label", () => {
    render(<Button variant="default" loading>Saving…</Button>);
    const b = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.querySelector("svg.animate-spin")).toBeTruthy();
  });

  it("renders icon before and iconRight after the label", () => {
    render(
      <Button variant="outline" icon={<Plus data-testid="before" aria-hidden="true" />} iconRight={<ArrowRight data-testid="after" aria-hidden="true" />}>
        New
      </Button>,
    );
    const b = screen.getByRole("button", { name: "New" });
    const kids = Array.from(b.childNodes);
    expect(kids[0]).toBe(screen.getByTestId("before"));
    expect(kids[1].textContent).toBe("New");
    expect(kids[2]).toBe(screen.getByTestId("after"));
  });

  it("an icon-only button keeps its aria-label as name and title as tooltip", () => {
    const onClick = vi.fn();
    render(
      <Button variant="ghost" size="icon" aria-label="Add item" title="Add item" onClick={onClick}>
        <Plus aria-hidden="true" />
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Add item" });
    expect(b.getAttribute("title")).toBe("Add item");
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("asChild renders the Link itself with button classes and no type", () => {
    render(
      <Button asChild variant="default">
        <a href="/requests/new">New request</a>
      </Button>,
    );
    const a = screen.getByRole("link", { name: "New request" });
    expect(a.getAttribute("href")).toBe("/requests/new");
    expect(a.hasAttribute("type")).toBe(false);
    expect(a.className).toMatch(/bg-primary/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("buttonVariants styles non-button elements and merges a className override last", () => {
    expect(buttonVariants({ variant: "outline" })).toMatch(/border-border-strong/);
    expect(buttonVariants({ variant: "ghost", size: "icon-sm", className: "size-5" })).toMatch(/\bsize-5\b/);
    expect(buttonVariants({ variant: "ghost", size: "icon-sm", className: "size-5" })).not.toMatch(/\bsize-8\b/);
  });
});
