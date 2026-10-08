// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { BoardCard } from "@/components/BoardCard";
import { RequestTable } from "@/components/RequestTable";
import { FilterBar } from "@/components/FilterBar";
import { parseParams } from "@/app/(app)/requests/params";
import type { RequestRow } from "@/lib/requests";

const row = (id: string, needsMotion: boolean): RequestRow => ({
  id, title: `Task ${id}`, status: "REQUESTED", brandName: "B", divisionName: "D", requesterName: "R", assigneeName: null,
  requestedAt: new Date("2026-10-01T00:00:00Z"), deadline: null, outputCount: 1, daysLeft: null, needsMotion,
});
afterEach(cleanup);

describe("Needs motion badge", () => {
  const card = (needs: boolean) => render(<DndContext><ul><BoardCard card={row("c", needs)} canMove={false} busy={false} dragging={false} /></ul></DndContext>);
  it("shows on a board card only when needsMotion is true, as icon + text", () => {
    card(true);
    const badge = screen.getByText("Needs motion");
    expect(badge.closest("span")?.querySelector("svg[aria-hidden='true']")).toBeTruthy();
    cleanup();
    card(false);
    expect(screen.queryByText("Needs motion")).toBeNull();
  });
  it("shows in the table next to the title only for flagged rows", () => {
    render(<RequestTable rows={[row("a", true), row("b", false)]} sort="deadline" dir="asc" hrefFor={() => "/x"} />);
    expect(screen.getAllByText("Needs motion")).toHaveLength(1);
    const th = screen.getByText("Task a").closest("th")!;
    expect(th.textContent).toContain("Needs motion");
    expect(screen.getByText("Task b").closest("th")!.textContent).not.toContain("Needs motion");
  });
});

describe("FilterBar Motion select", () => {
  const bar = (q: Record<string, string>) => render(<FilterBar p={parseParams(q)} brands={[]} divisions={[]} assignees={[]} mineHref="/m" clearHref="/c" />);
  it("offers Any / Needs motion / No motion, named motion, defaulting to Any", () => {
    bar({});
    const sel = screen.getByLabelText("Motion") as HTMLSelectElement;
    expect(sel.name).toBe("motion");
    expect(Array.from(sel.options).map((o) => [o.value, o.text])).toEqual([["", "Any"], ["yes", "Needs motion"], ["no", "No motion"]]);
    expect(sel.value).toBe("");
  });
  it("reflects the current param", () => {
    bar({ motion: "yes" });
    expect((screen.getByLabelText("Motion") as HTMLSelectElement).value).toBe("yes");
  });
});
