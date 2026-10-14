// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("headline, one line and an action", () => {
    render(<EmptyState icon={<Inbox aria-hidden="true" />} title="No requests yet" description="Create the first one." action={<a href="#new">New request</a>} />);
    expect(screen.getByText("No requests yet")).toBeTruthy();
    expect(screen.getByText("Create the first one.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "New request" })).toBeTruthy();
  });

  it("is a dashed surface with a round icon, built from the shadcn Empty parts", () => {
    const { container } = render(<EmptyState icon={<Inbox aria-hidden="true" />} title="No requests yet" className="mt-6" />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("data-slot")).toBe("empty");
    expect(root.className).toMatch(/border-dashed/);
    expect(root.className).toMatch(/\bmt-6\b/);
    expect(container.querySelector("[data-slot='empty-icon']")!.className).toMatch(/rounded-full/);
    expect(screen.getByText("No requests yet").getAttribute("data-slot")).toBe("empty-title");
  });

  it("the headline is a paragraph by default", () => {
    render(<EmptyState title="Nothing yet" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Nothing yet").tagName).toBe("P");
  });

  it("titleAs='h1' renders a page heading", () => {
    render(<EmptyState titleAs="h1" role="alert" title="No access" description="Ask an admin." />);
    expect(screen.getByRole("heading", { level: 1, name: "No access" }).className).toMatch(/text-heading/);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("inline is a quiet line without border or icon", () => {
    const { container } = render(<EmptyState size="inline" icon={<Inbox aria-hidden="true" />} title="No links yet." description="ignored" action={<a href="#x">ignored action</a>} />);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/\bborder-0\b/);
    expect(root.className).toMatch(/text-left|items-start/);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-slot='empty-icon']")).toBeNull();
    const line = screen.getByText("No links yet.");
    expect(line.tagName).toBe("P");
    expect(line.className).toMatch(/text-sm/);
    expect(line.className).toMatch(/text-muted-foreground/);
    expect(screen.queryByText("ignored")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("inline has no vertical padding of its own and takes margins from the call site", () => {
    const { container } = render(<EmptyState size="inline" title="No comments yet." className="mb-4" />);
    expect(container.firstElementChild!.className).toMatch(/\bmb-4\b/);
    expect(container.firstElementChild!.className).toMatch(/\bpy-0\b/);
    expect(container.firstElementChild!.className).not.toMatch(/\bpy-3\b/);
  });
});
