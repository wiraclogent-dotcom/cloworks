// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/shadcn/alert";

afterEach(cleanup);

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

describe("Alert", () => {
  it("destructive is an alert; the others are status; text is the message only", () => {
    render(
      <>
        <Alert variant="destructive"><AlertDescription>Could not save.</AlertDescription></Alert>
        <Alert variant="success"><AlertDescription>Saved.</AlertDescription></Alert>
        <Alert><AlertDescription>FYI.</AlertDescription></Alert>
        <Alert variant="warning"><AlertDescription>Careful.</AlertDescription></Alert>
      </>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Could not save.");
    expect(screen.getByRole("alert").getAttribute("data-tone")).toBe("cancelled");
    const tones = screen.getAllByRole("status").map((el) => el.getAttribute("data-tone"));
    expect(tones).toEqual(["done", "in-progress", "due-soon"]);
  });

  it("keeps the kit look: tinted box with tone tokens only", () => {
    render(<Alert variant="warning">x</Alert>);
    const el = screen.getByRole("status");
    expect(tokens(el)).toEqual(expect.arrayContaining(["flex", "items-start", "gap-2.5", "rounded-lg", "border", "border-tone-accent/40", "bg-tone-tint", "text-tone-text", "px-3", "py-2.5", "text-sm"]));
    expect(el.outerHTML).not.toMatch(/#[0-9a-f]{6}|text-white|bg-white|text-black/i);
  });

  it("role={null} renders static text with title and icon", () => {
    const { container } = render(
      <Alert variant="warning" role={null}>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Due soon.</AlertDescription>
      </Alert>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Heads up")).toBeTruthy();
    expect(container.querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });

  it("an explicit role overrides the variant default", () => {
    render(<Alert variant="success" role="alert">Failed after all.</Alert>);
    expect(screen.getByRole("alert").getAttribute("data-tone")).toBe("done");
  });

  it("each variant has its own default icon; icon replaces it; icon={false} drops it", () => {
    const { container, rerender } = render(<Alert variant="success">x</Alert>);
    const svgClass = (c: HTMLElement) => c.querySelector("svg")?.getAttribute("class") ?? "";
    expect(svgClass(container)).toMatch(/lucide-circle-check/);
    rerender(<Alert variant="destructive">x</Alert>);
    expect(svgClass(container)).toMatch(/lucide-circle-alert/);
    rerender(<Alert variant="warning">x</Alert>);
    expect(svgClass(container)).toMatch(/lucide-triangle-alert/);
    rerender(<Alert>x</Alert>);
    expect(svgClass(container)).toMatch(/lucide-info/);
    rerender(<Alert icon={<span data-testid="mine" />}>x</Alert>);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByTestId("mine")).toBeTruthy();
    rerender(<Alert icon={false}>x</Alert>);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-slot='alert-icon']")).toBeNull();
  });

  it("title and description stack in one column; the action sits to the right, outside it", () => {
    render(
      <Alert variant="destructive" id="a1" className="mb-3">
        <AlertTitle>Title</AlertTitle>
        <AlertDescription><p>Body</p></AlertDescription>
        <AlertAction><button type="button">Dismiss</button></AlertAction>
      </Alert>,
    );
    const root = screen.getByRole("alert");
    expect(root.id).toBe("a1");
    expect(tokens(root)).toContain("mb-3");
    const title = screen.getByText("Title");
    const body = screen.getByText("Body");
    const action = screen.getByRole("button", { name: "Dismiss" }).parentElement!;
    expect(tokens(title)).toContain("font-semibold");
    expect(body.parentElement!.tagName).toBe("DIV"); // a block child must not end up inside a <p>
    expect(title.parentElement).toBe(body.parentElement!.parentElement);
    expect(tokens(title.parentElement!)).toEqual(expect.arrayContaining(["min-w-0", "flex-1"]));
    expect(action.parentElement).toBe(root);
    expect(tokens(action)).toContain("shrink-0");
    expect(root.contains(title.parentElement)).toBe(true);
    expect(title.parentElement!.contains(action)).toBe(false);
  });

  it("passes aria-* and data-* attributes through (aria-describedby targets)", () => {
    render(<Alert variant="destructive" id="err" data-qa="x" aria-live="assertive">Nope</Alert>);
    const root = screen.getByRole("alert");
    expect(root.id).toBe("err");
    expect(root.getAttribute("data-qa")).toBe("x");
    expect(root.getAttribute("aria-live")).toBe("assertive");
  });
});
