// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { groupItems, type ItemRowInput } from "@/lib/projectItemList";
import { ProjectProgressSummary } from "@/components/projects/ProjectProgressSummary";
import { NeedsAttention } from "@/components/projects/NeedsAttention";

afterEach(cleanup);

let n = 0;
const row = (over: Partial<ItemRowInput>): ItemRowInput => ({
  id: `r${++n}`, title: "A", subTitle: null, position: n, ownerId: null, ownerName: null,
  stage: null, status: null, startDate: null, dueDate: null, dueTbc: false, ...over,
});
const d = (iso: string) => new Date(`${iso}T00:00:00+07:00`);
const stageRow = (stage: ProjectStage | null, over: Partial<ItemRowInput> = {}) => row({ stage, ...over });
const statusRow = (status: ProjectStatus | null, over: Partial<ItemRowInput> = {}) => row({ status, ...over });

describe("ProjectProgressSummary", () => {
  it("summarises a design project: percent, items done, one segment per stage present", () => {
    const rows = [
      stageRow("FINAL_ARTWORK", { title: "Pods" }), stageRow("FINAL_ARTWORK", { title: "Pods" }),
      stageRow("APPROVAL", { title: "Liquid" }), stageRow(null, { title: "Liquid" }),
    ];
    const { container } = render(<ProjectProgressSummary rows={rows} items={groupItems(rows)} />);
    expect(screen.getByText("50% done")).toBeTruthy();
    expect(screen.getByText("1 of 2 items done")).toBeTruthy();
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(3);
    const list = within(screen.getByRole("list", { name: "Progress breakdown" }));
    expect(list.getByText("Final Artwork: 2")).toBeTruthy();
    expect(list.getByText("Approval: 1")).toBeTruthy();
    expect(list.getByText("No stage yet: 1")).toBeTruthy();
  });

  it("sizes segments in proportion and tones the done segment", () => {
    const rows = [stageRow("FINAL_ARTWORK"), stageRow("FINAL_ARTWORK"), stageRow("APPROVAL"), stageRow(null)];
    const { container } = render(<ProjectProgressSummary rows={rows} items={groupItems(rows)} />);
    const segs = [...container.querySelectorAll<HTMLElement>("[data-segment]")];
    const done = segs.find((s) => s.getAttribute("data-segment") === "FINAL_ARTWORK")!;
    expect(done.getAttribute("data-tone")).toBe("done");
    expect(done.style.width).toBe("50%");
  });

  it("leaves canceled rows out of the bar and the item counts", () => {
    const rows = [stageRow("FINAL_ARTWORK", { title: "A" }), stageRow("CANCELLED", { title: "B" })];
    const { container } = render(<ProjectProgressSummary rows={rows} items={groupItems(rows)} />);
    expect(screen.getByText("100% done")).toBeTruthy();
    expect(screen.getByText("1 of 1 items done")).toBeTruthy();
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(1);
  });

  it("shows statuses, not stages, for a tracker project", () => {
    const rows = [statusRow("DONE", { title: "A" }), statusRow("IN_PROGRESS", { title: "B" }), statusRow(null, { title: "C" })];
    const { container } = render(<ProjectProgressSummary rows={rows} items={groupItems(rows)} />);
    expect(screen.getByText("33% done")).toBeTruthy();
    const list = within(screen.getByRole("list", { name: "Progress breakdown" }));
    expect(list.getByText("Done: 1")).toBeTruthy();
    expect(list.getByText("In Progress: 1")).toBeTruthy();
    expect(list.getByText("No status yet: 1")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Final Artwork|No stage yet|Approval/);
  });
});

describe("NeedsAttention", () => {
  const now = d("2026-10-14");
  const items = groupItems([
    stageRow("APPROVAL", { title: "Soon Item", dueDate: d("2026-10-17"), ownerName: "Rina" }),
    stageRow("MANUSCRIPT", { title: "Late Item", dueDate: d("2026-10-10"), ownerName: "Budi" }),
    stageRow("MANUSCRIPT", { title: "Far Item", dueDate: d("2026-12-10") }),
  ]);
  const needing = items.filter((i) => i.title !== "Far Item");

  it("lists overdue first, with links to the item anchors", () => {
    render(<NeedsAttention items={needing} now={now} />);
    expect(screen.getByRole("heading", { name: "Needs attention (2)" })).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Late Item", "Soon Item"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["#item-late-item", "#item-soon-item"]);
    expect(screen.getByText("Overdue by 4 days")).toBeTruthy();
    expect(screen.getByText("3 days left")).toBeTruthy();
    expect(screen.getByText("Manuscript 1")).toBeTruthy();
  });

  it("skips items that are not due soon or are done", () => {
    render(<NeedsAttention items={items} now={now} />);
    expect(screen.getByRole("heading", { name: "Needs attention (2)" })).toBeTruthy();
    expect(screen.queryByText("Far Item")).toBeNull();
  });

  it("renders nothing when no item needs attention", () => {
    const { container } = render(<NeedsAttention items={[]} now={now} />);
    expect(container.firstChild).toBeNull();
  });
});
