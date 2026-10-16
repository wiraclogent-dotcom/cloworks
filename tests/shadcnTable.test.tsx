// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, cleanup, within } from "@testing-library/react";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHeader,
} from "@/components/shadcn/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";

afterEach(cleanup);

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
const SCROLLER = /^overflow(-[xy])?-(auto|scroll|hidden)$/;

function sample(props: { containerClassName?: string; dense?: boolean } = {}) {
  const pad = props.dense ? "py-1.5" : undefined;
  return render(
    <Table containerClassName={props.containerClassName} className="min-w-[40rem]">
      <TableCaption className="sr-only">People</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className={pad}>Title</TableHead>
          <TableHead scope="col" numeric className={pad}>Done</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableRowHeader className={pad}>Alpha</TableRowHeader>
          <TableCell numeric className={pad}>3</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("shadcn Table (monday-style: hairlines, no zebra, row hover, sticky header)", () => {
  it("sticky header, row hover, compact density", () => {
    sample();
    const th = screen.getByRole("columnheader", { name: "Title" });
    expect(tokens(th)).toEqual(expect.arrayContaining(["sticky", "top-0", "z-10", "bg-muted", "border-b", "text-xs", "font-semibold", "text-muted-foreground", "py-2.5"]));
    const row = screen.getAllByRole("row")[1];
    expect(tokens(row)).toEqual(expect.arrayContaining(["border-t", "first:border-t-0", "hover:bg-muted/60", "transition-colors", "duration-150"]));
    // No zebra striping, and no tint for rows that merely contain an aria-expanded trigger (shadcn's default).
    expect(row.className).not.toMatch(/even:|odd:|has-aria-expanded/);
    expect(tokens(screen.getByRole("cell", { name: "3" }))).toContain("py-2.5");
    cleanup();
    // Compact density comes from className: the last padding wins.
    sample({ dense: true });
    const cell = tokens(screen.getByRole("cell", { name: "3" }));
    expect(cell).toContain("py-1.5");
    expect(cell).not.toContain("py-2.5");
    expect(tokens(screen.getByRole("columnheader", { name: "Title" }))).toContain("py-1.5");
  });

  it("renders a semantic table: caption, column headers, a row header and right-aligned numbers", () => {
    sample();
    const table = screen.getByRole("table", { name: "People" });
    expect(tokens(table)).toEqual(expect.arrayContaining(["w-full", "border-collapse", "text-left", "text-compact", "text-foreground", "min-w-[40rem]"]));
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Title", "Done"]);
    const rowHeader = within(table).getByRole("rowheader", { name: "Alpha" });
    expect(rowHeader.getAttribute("scope")).toBe("row");
    expect(tokens(rowHeader)).toEqual(expect.arrayContaining(["font-medium", "align-middle", "px-3"]));
    expect(tokens(screen.getByRole("columnheader", { name: "Done" }))).toEqual(expect.arrayContaining(["text-right", "tabular-nums"]));
    expect(tokens(screen.getByRole("cell", { name: "3" }))).toEqual(expect.arrayContaining(["text-right", "tabular-nums"]));
  });

  it("the container is the one scroll box, so the sticky header sticks to it (no nested scroller)", () => {
    const { container } = sample({ containerClassName: "max-h-[70dvh]" });
    const box = container.querySelector("[data-slot='table-container']")!;
    expect(tokens(box)).toEqual(expect.arrayContaining(["relative", "overflow-auto", "max-h-[70dvh]"]));
    const th = screen.getByRole("columnheader", { name: "Title" });
    const scrollers: Element[] = [];
    for (let a = th.parentElement; a && a !== container; a = a.parentElement) if (tokens(a).some((t) => SCROLLER.test(t))) scrollers.push(a);
    expect(scrollers).toEqual([box]);
  });

  it("stays a server component (no 'use client') and has no shadcn defaults that change the look", () => {
    const src = readFileSync(path.resolve(__dirname, "../src/components/shadcn/table.tsx"), "utf8");
    expect(src).not.toMatch(/^["']use client["']/m);
    expect(src).not.toMatch(/whitespace-nowrap \[&:has|bg-muted\/50|has-aria-expanded/);
  });
});

describe("shadcn ToggleGroup (single choice)", () => {
  it("is a labelled radio group: the chosen item is checked, a click picks another, the chosen one cannot be cleared", () => {
    const picked: string[] = [];
    render(
      <ToggleGroup type="single" aria-label="Range" value="m" onValueChange={(v) => picked.push(v)}>
        <ToggleGroupItem value="m">Month</ToggleGroupItem>
        <ToggleGroupItem value="y">Year</ToggleGroupItem>
      </ToggleGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Range" });
    const month = within(group).getByRole("radio", { name: "Month" });
    expect(month.getAttribute("aria-checked")).toBe("true");
    expect(within(group).getByRole("radio", { name: "Year" }).getAttribute("aria-checked")).toBe("false");
    within(group).getByRole("radio", { name: "Year" }).click();
    month.click();
    expect(picked).toEqual(["y"]);
  });

  it("uses our focus ring, 150ms colour transition and 55% disabled opacity", () => {
    render(<ToggleGroup type="single" aria-label="G"><ToggleGroupItem value="a">A</ToggleGroupItem></ToggleGroup>);
    const t = tokens(screen.getByRole("radio", { name: "A" }));
    expect(t).toEqual(expect.arrayContaining(["focus-visible:outline-2", "focus-visible:outline-ring", "transition-colors", "duration-150", "disabled:opacity-55"]));
  });
});
