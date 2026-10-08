// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FilterBar } from "@/components/FilterBar";
import { parseParams } from "@/app/(app)/requests/params";

afterEach(cleanup);
const bar = (raw: Record<string, string>) =>
  render(<FilterBar p={parseParams(raw)} brands={[]} divisions={[]} assignees={[]} mineHref="/requests?mine=1" clearHref="/requests" />);
const hidden = (c: HTMLElement) => Object.fromEntries([...c.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => [i.name, i.value]));

describe("FilterBar", () => {
  it("carries the current table sort and direction through Apply", () => {
    const { container } = bar({ view: "table", sort: "title", dir: "desc" });
    expect(hidden(container)).toEqual({ view: "table", sort: "title", dir: "desc" });
  });
  it("adds nothing extra for the default view", () => {
    expect(hidden(bar({}).container)).toEqual({});
  });
  it("uses aria-current, not the invalid aria-pressed, on the My requests link", () => {
    bar({ mine: "1" });
    const link = screen.getByRole("link", { name: /My requests/ });
    expect(link.getAttribute("aria-current")).toBe("true");
    expect(link.hasAttribute("aria-pressed")).toBe(false);
    expect(link.textContent).toContain("✓");
  });
});
