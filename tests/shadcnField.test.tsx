// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { srcFiles } from "./helpers/srcFiles";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Label } from "@/components/shadcn/label";
import { labelClassName } from "@/components/shadcn/label-class";
import { Field, FieldLabel, FieldDescription, FieldError } from "@/components/shadcn/field";

afterEach(cleanup);

const classes = (el: HTMLElement) => el.className.split(/\s+/);

describe("Input", () => {
  it("is 36px with the kit's outline, surface, text and placeholder tokens", () => {
    render(<Input aria-label="Name" />);
    const c = classes(screen.getByRole("textbox", { name: "Name" }));
    for (const t of ["h-9", "rounded-lg", "border", "border-input", "bg-card", "text-sm", "placeholder:text-placeholder", "hover:border-muted-foreground", "focus-visible:outline-ring"]) {
      expect(c, t).toContain(t);
    }
  });

  it("size=sm is 32px", () => {
    render(<Input size="sm" aria-label="Name" />);
    const c = classes(screen.getByRole("textbox", { name: "Name" }));
    expect(c).toContain("h-8");
    expect(c).not.toContain("h-9");
  });

  it("aria-invalid swaps to the danger border", () => {
    render(<Input aria-label="Name" aria-invalid />);
    expect(classes(screen.getByRole("textbox", { name: "Name" }))).toContain("aria-invalid:border-danger");
    expect(screen.getByRole("textbox", { name: "Name" }).getAttribute("aria-invalid")).toBe("true");
  });

  it("disabled fields use the muted surface", () => {
    render(<Input aria-label="Name" disabled />);
    const c = classes(screen.getByRole("textbox", { name: "Name" }));
    expect(c).toContain("disabled:bg-muted");
    expect(c).toContain("disabled:opacity-70");
  });

  it("passes type, name and className through", () => {
    render(<Input aria-label="Mail" type="email" name="email" className="max-w-xs" />);
    const el = screen.getByRole("textbox", { name: "Mail" });
    expect(el.getAttribute("type")).toBe("email");
    expect(el.getAttribute("name")).toBe("email");
    expect(classes(el)).toContain("max-w-xs");
  });
});

describe("Textarea", () => {
  it("is at least 96px with 8px vertical padding", () => {
    render(<Textarea aria-label="Notes" />);
    const c = classes(screen.getByRole("textbox", { name: "Notes" }));
    expect(c).toContain("min-h-24");
    expect(c).toContain("py-2");
    expect(c).toContain("aria-invalid:border-danger");
    expect(c).toContain("disabled:bg-muted");
  });
});

describe("Label", () => {
  it("is 13px/500", () => {
    render(<Label htmlFor="x">Name</Label>);
    const c = classes(screen.getByText("Name"));
    expect(c).toContain("text-compact");
    expect(c).toContain("font-medium");
    expect(labelClassName).toContain("text-compact font-medium");
  });

  it("labelClassName lives in a server-safe module, not in the \"use client\" label.tsx", () => {
    // A string exported from a client module reaches a server component as a client reference, not a string.
    const dir = path.resolve(__dirname, "../src/components/shadcn");
    expect(readFileSync(path.join(dir, "label-class.ts"), "utf8")).not.toMatch(/["']use client["']/);
    expect(readFileSync(path.join(dir, "label.tsx"), "utf8")).not.toMatch(/export\s*\{[^}]*labelClassName/);
  });

  it("names its control through htmlFor", () => {
    render(<><Label htmlFor="x">Title</Label><Input id="x" /></>);
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });
});

describe("Field parts", () => {
  it("FieldError renders icon + message with the given id, nothing when empty", () => {
    const { container, rerender } = render(<FieldError id="e1">Required</FieldError>);
    const el = container.querySelector("#e1")!;
    expect(el.textContent).toBe("Required");
    expect(el.querySelector("svg[aria-hidden='true']")).toBeTruthy();
    expect(classes(el as HTMLElement)).toContain("text-danger");
    rerender(<FieldError id="e1">{undefined}</FieldError>);
    expect(container.querySelector("#e1")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("FieldDescription is 12px helper text and keeps its id", () => {
    render(<FieldDescription id="h1">Used for sign-in</FieldDescription>);
    const el = screen.getByText("Used for sign-in");
    expect(el.id).toBe("h1");
    expect(classes(el)).toContain("text-xs");
    expect(classes(el)).toContain("text-muted-foreground");
  });

  it("Field + FieldLabel label a control", () => {
    render(<Field><FieldLabel htmlFor="n">Name</FieldLabel><Input id="n" /></Field>);
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });
});

describe("field usage", () => {
  const root = path.resolve(__dirname, "../src");
  const files = srcFiles(root);
  const read = (f: string) => readFileSync(f, "utf8");

  it("labelClass, hintClass and the kit FieldError are gone", () => {
    const users = files.filter((f) => /\b(?:labelClass|hintClass)\b/.test(read(f)) || /import[^;]*\bFieldError\b[^;]*ui\/Field"/.test(read(f)));
    expect(users.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("fieldClass and the kit Field file are gone", () => {
    const users = files.filter((f) => /\bfieldClass\b|ui\/Field["']/.test(read(f)));
    expect(users.map((f) => path.relative(root, f))).toEqual([]);
  });
});
