// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/shadcn/card";

afterEach(cleanup);

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

describe("Card", () => {
  it("card surface: radius, border, card token, resting shadow, 16px padding", () => {
    render(<Card data-testid="c">Body</Card>);
    const have = tokens(screen.getByTestId("c"));
    for (const t of ["rounded-xl", "border", "border-border", "bg-card", "text-card-foreground", "shadow-card", "p-4"]) {
      expect(have, t).toContain(t);
    }
  });

  it("className p-0 makes it edge to edge (tables)", () => {
    render(<Card data-testid="c" className="p-0 overflow-hidden" />);
    const have = tokens(screen.getByTestId("c"));
    expect(have).toContain("p-0");
    expect(have).not.toContain("p-4");
  });

  it("asChild puts the surface on the child element and keeps its role and name", () => {
    render(<Card asChild className="p-3"><section aria-label="Month summary">Body</section></Card>);
    const el = screen.getByRole("region", { name: "Month summary" });
    expect(el.tagName).toBe("SECTION");
    expect(tokens(el)).toEqual(expect.arrayContaining(["rounded-xl", "bg-card", "shadow-card", "p-3"]));
    expect(tokens(el)).not.toContain("p-4");
  });

  it("CardTitle is an h2 by default and h3 with as='h3'", () => {
    render(<><CardTitle>Details</CardTitle><CardTitle as="h3">Nested</CardTitle><CardTitle as="h4">Deeper</CardTitle></>);
    expect(screen.getByRole("heading", { level: 2, name: "Details" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Nested" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "Deeper" })).toBeTruthy();
  });

  it("CardTitle is 16px semibold in the heading colour and passes id through", () => {
    render(<CardTitle id="t">Title</CardTitle>);
    const el = screen.getByRole("heading", { name: "Title" });
    expect(tokens(el)).toEqual(expect.arrayContaining(["text-base", "font-semibold", "text-heading"]));
    expect(el.id).toBe("t");
  });

  it("CardAction sits in the header's right-hand group, after the title block", () => {
    render(
      <CardHeader data-testid="h">
        <CardTitle>Details</CardTitle>
        <CardDescription>Sub</CardDescription>
        <CardAction><button>Edit</button></CardAction>
      </CardHeader>,
    );
    const header = screen.getByTestId("h");
    expect(tokens(header)).toEqual(expect.arrayContaining(["mb-3", "flex", "flex-wrap", "justify-between"]));
    const [left, right] = Array.from(header.children);
    expect(left.contains(screen.getByRole("heading", { name: "Details" }))).toBe(true);
    expect(left.contains(screen.getByText("Sub"))).toBe(true);
    expect(right.getAttribute("data-slot")).toBe("card-action");
    expect(right.contains(screen.getByRole("button", { name: "Edit" }))).toBe(true);
  });

  it("a header without an action renders only the title block", () => {
    render(<CardHeader data-testid="h"><CardTitle>Solo</CardTitle></CardHeader>);
    expect(screen.getByTestId("h").children).toHaveLength(1);
  });

  it("content and footer render their children", () => {
    render(<Card><CardContent>Body</CardContent><CardFooter>Foot</CardFooter></Card>);
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.getByText("Foot")).toBeTruthy();
  });
});
