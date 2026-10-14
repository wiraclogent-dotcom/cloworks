// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NativeSelect } from "@/components/shadcn/native-select";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";

afterEach(cleanup);

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

describe("NativeSelect", () => {
  it("looks like Input: same height, radius, outline and surface", () => {
    render(<><Input aria-label="Text" /><NativeSelect aria-label="Pick"><option>A</option></NativeSelect></>);
    const have = new Set(tokens(screen.getByRole("combobox", { name: "Pick" })));
    for (const t of ["h-9", "rounded-lg", "border-input", "bg-card", "aria-invalid:border-danger", "focus-visible:outline-ring"]) {
      expect(have.has(t), t).toBe(true);
    }
    // every Input class except the width it sets on itself is carried over
    const missing = tokens(screen.getByRole("textbox", { name: "Text" })).filter((t) => !have.has(t));
    expect(missing).toEqual([]);
  });

  it("size sm is 32px like Input sm", () => {
    render(<NativeSelect size="sm" aria-label="Pick"><option>A</option></NativeSelect>);
    const t = tokens(screen.getByRole("combobox", { name: "Pick" }));
    expect(t).toContain("h-8");
    expect(t).not.toContain("h-9");
  });

  it("posts its value in a plain form", () => {
    const { container } = render(
      <form><NativeSelect name="brandId" defaultValue="b"><option value="a">A</option><option value="b">B</option></NativeSelect></form>,
    );
    expect(new FormData(container.querySelector("form")!).get("brandId")).toBe("b");
  });

  it("is full width by default; className widths go to the wrapper", () => {
    const { container, rerender } = render(<NativeSelect aria-label="Pick"><option>A</option></NativeSelect>);
    const wrapper = () => container.querySelector('[data-slot="native-select-wrapper"]')!;
    expect(tokens(wrapper())).toContain("w-full");
    rerender(<NativeSelect aria-label="Pick" className="w-36"><option>A</option></NativeSelect>);
    expect(tokens(wrapper())).toContain("w-36");
    expect(tokens(wrapper())).not.toContain("w-full");
    expect(tokens(screen.getByRole("combobox", { name: "Pick" }))).not.toContain("w-36");
  });

  it("selectClassName reaches the select, which wins over the field look", () => {
    render(<NativeSelect aria-label="Pick" selectClassName="rounded-full h-8"><option>A</option></NativeSelect>);
    const t = tokens(screen.getByRole("combobox", { name: "Pick" }));
    expect(t).toContain("rounded-full");
    expect(t).not.toContain("rounded-lg");
    expect(t).toContain("h-8");
    expect(t).not.toContain("h-9");
  });

  it("keeps the accessible name from its label and passes aria-invalid through", () => {
    render(<><Label htmlFor="b">Brand</Label><NativeSelect id="b" aria-invalid><option>A</option></NativeSelect></>);
    const select = screen.getByRole("combobox", { name: "Brand" });
    expect(select.getAttribute("aria-invalid")).toBe("true");
  });

  it("draws a muted chevron that does not take clicks", () => {
    const { container } = render(<NativeSelect aria-label="Pick"><option>A</option></NativeSelect>);
    const icon = container.querySelector('[data-slot="native-select-icon"]')!;
    expect(tokens(icon)).toEqual(expect.arrayContaining(["text-muted-foreground", "pointer-events-none"]));
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  });
});
