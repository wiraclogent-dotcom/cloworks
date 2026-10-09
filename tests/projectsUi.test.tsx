// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { act } from "react";

const submit = vi.fn();
vi.mock("@/app/(app)/projects/actions", () => ({ submitProject: (...a: unknown[]) => submit(...a) }));
vi.mock("../actions", () => ({ submitProject: (...a: unknown[]) => submit(...a) }));

import { ProjectForm } from "@/app/(app)/projects/ProjectForm";
import { ProjectTable, type ProjectRow } from "@/components/ProjectTable";
import { ProjectTimeline } from "@/components/ProjectTimeline";

afterEach(cleanup);
const d = (s: string) => new Date(`${s}T00:00:00+07:00`);
const row = (o: Partial<ProjectRow> & { id: string }): ProjectRow => ({
  title: o.id, subTitle: null, brandName: null, ownerName: "Rina", status: "IN_PROGRESS", startDate: null, dueDate: null, fileUrl: null, ...o,
});
const now = d("2026-10-08");

describe("ProjectTable", () => {
  const rows = [
    row({ id: "Orphan", brandName: null, dueDate: d("2026-10-20") }),
    row({ id: "Zed 2", brandName: "Zed", dueDate: d("2026-11-01"), subTitle: "Phase 2", fileUrl: "https://x.test/f" }),
    row({ id: "Zed 1", brandName: "Zed", dueDate: d("2026-10-10"), startDate: d("2026-10-01") }),
    row({ id: "Alpha 1", brandName: "Alpha", status: "DONE", dueDate: d("2026-10-01"), fileUrl: "javascript:alert(1)" }),
  ];
  it("groups by brand with No brand last and sorts by due date", () => {
    render(<ProjectTable rows={rows} canManage={false} now={now} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Alpha", "Zed", "No brand"]);
    const zed = within(screen.getByRole("region", { name: "Zed" }));
    expect(zed.getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["Zed 1", "Zed 2Phase 2"]);
  });
  it("shows dates, days left (not for done), safe links, status text", () => {
    render(<ProjectTable rows={rows} canManage={false} now={now} />);
    const zed1 = screen.getByRole("row", { name: /Zed 1/ });
    expect(zed1.textContent).toContain("1 Oct 2026");
    expect(zed1.textContent).toContain("2 days left");
    expect(zed1.textContent).toContain("In progress");
    const alpha = screen.getByRole("row", { name: /Alpha 1/ });
    expect(alpha.textContent).toContain("Done");
    // The only link in a row without a file is the title link to the project's detail page.
    const rowLinks = within(alpha).queryAllByRole("link");
    expect(rowLinks.map((a) => a.getAttribute("href"))).toEqual([`/projects/${"Alpha 1"}`]);
    expect(alpha.textContent).not.toContain("left");
    // Two links now: the title (detail page) and the file. Pick the external file link.
    const link = within(screen.getByRole("row", { name: /Zed 2/ })).getAllByRole("link").find((a) => a.getAttribute("rel"))!;
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByRole("row", { name: /Orphan/ }).textContent).toContain("—");
  });
  it("shows Edit links only to managers", () => {
    const { unmount } = render(<ProjectTable rows={rows} canManage={false} now={now} />);
    expect(screen.queryByRole("link", { name: /Edit/ })).toBeNull();
    unmount();
    render(<ProjectTable rows={rows} canManage now={now} />);
    expect(screen.getByRole("link", { name: /Edit Zed 1/ }).getAttribute("href")).toMatch(/^\/projects\/.+\/edit$/);
  });
  it("shows a plain empty state", () => {
    render(<ProjectTable rows={[]} canManage={false} now={now} />);
    expect(screen.getByText(/No projects yet/)).toBeTruthy();
    expect(screen.queryByText(/New project/)).toBeNull();
  });
});

describe("ProjectTimeline", () => {
  it("labels each bar with text and only draws projects with both dates", () => {
    render(<ProjectTimeline today={now} projects={[
      { id: "a", title: "Alpha", startDate: d("2026-10-05"), dueDate: d("2026-10-16") },
      { id: "b", title: "NoDue", startDate: d("2026-10-05"), dueDate: null },
    ]} />);
    expect(screen.getByTitle(/Alpha: 5 Oct 2026 to 16 Oct 2026/)).toBeTruthy();
    expect(screen.queryByText("NoDue")).toBeNull();
    expect(screen.getByText("5 Oct 2026")).toBeTruthy();
  });
  it("explains when nothing can be drawn", () => {
    render(<ProjectTimeline today={now} projects={[{ id: "b", title: "NoDue", startDate: null, dueDate: null }]} />);
    expect(screen.getByText(/both a start and a due date/)).toBeTruthy();
  });
});

describe("ProjectForm", () => {
  it("keeps typed values and focuses the first invalid field after a failed submit", async () => {
    submit.mockImplementation(async (_id: unknown, _prev: unknown, fd: FormData) => ({
      ok: false, code: "VALIDATION", message: "bad", nonce: "n1", fieldErrors: { dueDate: "Due date cannot be before the start date" },
      values: Object.fromEntries(["title", "subTitle", "brandId", "ownerId", "status", "startDate", "dueDate", "fileUrl"].map((k) => [k, String(fd.get(k))])),
    }));
    render(<ProjectForm brands={[{ id: "b1", name: "Alpha" }]} owners={[{ id: "u1", name: "Rina" }]} />);
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Rebrand" } });
    fireEvent.change(screen.getByLabelText("Sub title"), { target: { value: "Phase 1" } });
    fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "b1" } });
    fireEvent.change(screen.getByLabelText(/^Owner/), { target: { value: "u1" } });
    fireEvent.change(screen.getByLabelText(/^Status/), { target: { value: "IN_REVIEW" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("File link"), { target: { value: "https://x.test/f" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Create project/ })); });
    await waitFor(() => expect(screen.getByText("Due date cannot be before the start date")).toBeTruthy());
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Rebrand");
    expect((screen.getByLabelText("Sub title") as HTMLInputElement).value).toBe("Phase 1");
    expect((screen.getByLabelText("Brand") as HTMLSelectElement).value).toBe("b1");
    expect((screen.getByLabelText(/^Owner/) as HTMLSelectElement).value).toBe("u1");
    expect((screen.getByLabelText(/^Status/) as HTMLSelectElement).value).toBe("IN_REVIEW");
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe("2026-10-10");
    expect((screen.getByLabelText("Due date") as HTMLInputElement).value).toBe("2026-10-01");
    expect((screen.getByLabelText("File link") as HTMLInputElement).value).toBe("https://x.test/f");
    expect(document.activeElement).toBe(screen.getByLabelText("Due date"));
    expect(screen.getByLabelText("Due date").getAttribute("aria-invalid")).toBe("true");
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("1 problem: Due date cannot be before the start date");
  });
});
