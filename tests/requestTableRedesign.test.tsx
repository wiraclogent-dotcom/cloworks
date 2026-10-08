// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { RequestTable } from "@/components/RequestTable";
import { Pagination } from "@/components/Pagination";
import { BoardSkeleton, DetailSkeleton, TableSkeleton } from "@/components/RequestSkeletons";
import type { RequestRow } from "@/lib/requests";

afterEach(cleanup);

const row = (id: string, extra: Partial<RequestRow> = {}): RequestRow => ({
  id, title: `Task ${id}`, status: "ON_PROGRESS", brandName: "Bubble Wash", divisionName: "Sales", requesterName: "Rina Sari", assigneeName: "Cami",
  requestedAt: new Date("2026-10-01T00:00:00Z"), deadline: new Date("2026-10-10T00:00:00Z"), outputCount: 1, daysLeft: 2, needsMotion: false, ...extra,
});
const table = (rows: RequestRow[], sort: "deadline" | "title" = "deadline", dir: "asc" | "desc" = "asc", footer?: React.ReactNode) =>
  render(<RequestTable rows={rows} sort={sort} dir={dir} hrefFor={(k, d) => `/requests?sort=${k}&dir=${d}`} footer={footer} />);

describe("RequestTable (redesign)", () => {
  it("keeps every sortable header link with aria-sort and shows a sort icon", () => {
    table([row("a")], "title", "desc");
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent!.replace(/,.*$/, ""))).toEqual(["Request", "Brand", "Division", "Requester", "Assignee", "Status", "Requested", "Deadline"]);
    const title = screen.getByRole("columnheader", { name: /Request,/ });
    expect(title.getAttribute("aria-sort")).toBe("descending");
    expect(within(title).getByRole("link").getAttribute("href")).toBe("/requests?sort=title&dir=asc");
    expect(title.querySelector("[data-sort-icon='desc']")).toBeTruthy();
    const brand = screen.getByRole("columnheader", { name: /Brand,/ });
    expect(brand.getAttribute("aria-sort")).toBe("none");
    expect(brand.querySelector("[data-sort-icon='none']")).toBeTruthy();
    expect(headers[0].className).toMatch(/sticky/);
  });

  it("renders the row cells: title link, brand tag, avatars + names, status chip, dates and deadline chip", () => {
    table([row("a", { needsMotion: true })]);
    const r = screen.getAllByRole("row")[1];
    expect(r.className).toMatch(/h-11/);
    expect(within(r).getByRole("link", { name: "Task a" }).getAttribute("href")).toBe("/requests/a");
    expect(within(r).getByText("Needs motion")).toBeTruthy();
    expect(within(r).getByText("Bubble Wash").getAttribute("data-tone")).toBe("tag-bubble-wash");
    expect(within(r).getByText("Rina Sari").previousElementSibling?.textContent).toBe("RS");
    expect(within(r).getByText("Cami")).toBeTruthy();
    expect(within(r).getByText("On progress").closest("[data-tone]")!.getAttribute("data-tone")).toBe("in-progress");
    expect(within(r).getByText("01 Oct 2026")).toBeTruthy();
    const deadline = r.querySelector("[data-cell='deadline']")!;
    expect(deadline.textContent).toContain("10 Oct 2026");
    expect(within(deadline as HTMLElement).getByText("2 days left").getAttribute("data-deadline")).toBe("due-soon");
  });

  it("shows Unassigned as muted text, and no deadline chip for finished or undated rows", () => {
    table([row("a", { assigneeName: null, status: "DONE" }), row("b", { deadline: null, daysLeft: null })]);
    const [, a, b] = screen.getAllByRole("row");
    expect(a.querySelector("[data-cell='assignee']")!.textContent).toBe("Unassigned");
    expect(a.querySelector("[data-cell='assignee'] span")!.className).toMatch(/text-foreground-secondary/);
    expect(a.querySelector("[data-deadline]")).toBeNull();
    expect(b.querySelector("[data-cell='deadline']")!.textContent).toBe("—");
  });

  it("scrolls sideways inside the card and puts the footer in the same card", () => {
    table([row("a")], "deadline", "asc", <p>footer here</p>);
    const scroll = document.querySelector("[data-table-scroll]") as HTMLElement;
    expect(scroll.className).toMatch(/overflow-auto/);
    expect(scroll.querySelector("table")!.className).toMatch(/min-w-\[64rem\]/);
    expect(scroll.parentElement!.contains(screen.getByText("footer here"))).toBe(true);
    expect(scroll.parentElement!.className).toMatch(/rounded-xl/);
  });

  it("shows an empty state when nothing matches", () => {
    table([]);
    expect(screen.getByText("No requests match these filters.")).toBeTruthy();
    expect(document.querySelector("table")).toBeNull();
  });
});

describe("Pagination (table footer)", () => {
  it("shows the range, the page text and Previous / Next links", () => {
    render(<Pagination text="Showing 51–100 of 552" page={2} pageCount={12} hrefFor={(n) => `/requests?page=${n}`} />);
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(nav).getByText("Showing 51–100 of 552")).toBeTruthy();
    expect(within(nav).getByText("Page 2 of 12")).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/requests?page=1");
    expect(within(nav).getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/requests?page=3");
    expect(within(nav).getByRole("link", { name: "Next" }).getAttribute("rel")).toBe("next");
  });
  it("disables Previous on the first page and hides paging for a single page", () => {
    const { unmount } = render(<Pagination text="Showing 1–50 of 552" page={1} pageCount={12} hrefFor={(n) => `/p${n}`} />);
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
    expect(screen.getByText("Previous").closest("[aria-disabled]")!.getAttribute("aria-disabled")).toBe("true");
    unmount();
    render(<Pagination text="Showing 1–3 of 3" page={1} pageCount={1} hrefFor={(n) => `/p${n}`} />);
    expect(screen.queryByText(/Page 1 of/)).toBeNull();
    expect(screen.queryByText("Next")).toBeNull();
  });
});

describe("loading skeletons", () => {
  it("board: 4 columns with 3 card skeletons each, announced as loading", () => {
    render(<BoardSkeleton />);
    const s = screen.getByRole("status");
    expect(s.textContent).toContain("Loading requests…");
    expect(s.getAttribute("aria-busy")).toBe("true");
    const cols = document.querySelectorAll("[data-skeleton-column]");
    expect(cols.length).toBe(4);
    cols.forEach((c) => expect(c.querySelectorAll("[data-skeleton-card]").length).toBe(3));
  });
  it("table: 8 row skeletons", () => {
    render(<TableSkeleton />);
    expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(8);
    expect(screen.getByRole("status").textContent).toContain("Loading requests…");
  });
  it("detail: two-column skeleton", () => {
    render(<DetailSkeleton />);
    expect(screen.getByRole("status").textContent).toContain("Loading request…");
    const grid = document.querySelector("[data-skeleton-detail]") as HTMLElement;
    expect(grid.className).toMatch(/lg:grid-cols-/);
    expect(grid.children.length).toBe(2);
  });
});
