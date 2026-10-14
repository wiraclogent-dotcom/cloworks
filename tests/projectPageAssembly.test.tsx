// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";

const redirect = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u), notFound: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

// Each piece is replaced by a marker so the test checks only the order and the props the page hands down.
const seen: Record<string, Record<string, unknown>> = {};
const record = (name: string, props: Record<string, unknown>) => { seen[name] = props; };
function marker(name: string) {
  const Piece = (props: Record<string, unknown>) => { record(name, props); return <div data-piece={name} />; };
  Piece.displayName = `Piece(${name})`;
  return Piece;
}
vi.mock("@/components/projects/ProjectDetailsCard", () => ({ ProjectDetailsCard: marker("details") }));
vi.mock("@/components/projects/ProjectProgressSummary", () => ({ ProjectProgressSummary: marker("progress") }));
vi.mock("@/components/projects/NeedsAttention", () => ({ NeedsAttention: marker("attention") }));
vi.mock("@/components/projects/ProjectItemsList", () => ({ ProjectItemsList: marker("items") }));
vi.mock("@/components/projects/ItemHashOpener", () => ({ ItemHashOpener: marker("opener") }));
vi.mock("@/components/ProjectTimeline", () => ({ ProjectTimeline: marker("timeline") }));
vi.mock("@/app/(app)/projects/[id]/MilestoneList", () => ({ MilestoneList: marker("milestones") }));

import ProjectTasksPage from "@/app/(app)/projects/[id]/tasks/page";
import { ProjectPageView, type ProjectPageProject } from "@/app/(app)/projects/[id]/ProjectPageView";

afterEach(() => { cleanup(); for (const k of Object.keys(seen)) delete seen[k]; });

const D = (s: string) => new Date(`${s}T00:00:00+07:00`);
const task = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, title, subTitle: null, position: 0, ownerId: "u1", owner: { name: "Dewi" }, stage: "DESIGN", status: null,
  startDate: D("2026-10-01"), dueDate: D("2026-10-20"), dueTbc: false, fileName: null, fileUrl: null, notes: null, ...over,
}) as unknown as ProjectPageProject["tasks"][number];
const project = (over: Partial<ProjectPageProject> = {}): ProjectPageProject => ({
  id: "p1", title: "Redesign", subTitle: null, code: "RD-1", status: "IN_PROGRESS", brandId: "b1", ownerId: "u1",
  startDate: D("2026-10-01"), dueDate: D("2026-11-01"), fileUrl: null,
  brand: { name: "Laundry" }, owner: { name: "Dewi" },
  tasks: [task("t1", "Pods", { position: 0 }), task("t2", "Pods", { position: 1, subTitle: "Mini" }), task("t3", "Box", { position: 2 })],
  milestones: [{ id: "m1", title: "Kickoff", date: D("2026-10-02"), done: false }],
  ...over,
} as ProjectPageProject);
const view = (p = project(), canManage = true) => (
  <ProjectPageView project={p} canManage={canManage} brands={[{ id: "b1", name: "Laundry" }]} owners={[{ id: "u1", name: "Dewi" }]}
    taskOwners={[{ id: "u1", name: "Dewi" }]} now={new Date("2026-10-14T05:00:00Z")} />
);

describe("tasks page", () => {
  it("redirects to the project page", async () => {
    await expect(ProjectTasksPage({ params: Promise.resolve({ id: "p1" }) })).rejects.toThrow("NEXT_REDIRECT /projects/p1");
    expect(redirect).toHaveBeenCalledWith("/projects/p1");
  });
});

describe("project page assembly", () => {
  it("orders details, progress, needs attention, items, timeline (closed), milestones (closed)", () => {
    const { container } = render(view());
    const order = Array.from(container.querySelectorAll("[data-piece], [data-closed-section]")).map((el) =>
      el.getAttribute("data-piece") ?? `section:${el.getAttribute("data-closed-section")}`);
    expect(order).toEqual(["details", "progress", "attention", "items", "opener", "section:timeline", "timeline", "section:milestones", "milestones"]);
    for (const id of ["timeline", "milestones"]) expect(container.querySelector(`details[data-closed-section="${id}"]`)?.hasAttribute("open")).toBe(false);
  });

  it("hands the stage mode to Needs attention and no href to the timeline", () => {
    render(view());
    expect(seen.attention.mode).toBe("stage");
    expect("href" in seen.timeline).toBe(false);
    expect((seen.items.items as unknown[]).length).toBe(2);
  });

  it("uses status mode for a tracker project", () => {
    render(view(project({ tasks: [task("t1", "Pods", { stage: null, status: "IN_PROGRESS" })] })));
    expect(seen.attention.mode).toBe("status");
    expect(seen.items.mode).toBe("status");
  });

  it("hands the details card Jakarta days and the edit lists", () => {
    render(view());
    expect(seen.details.canManage).toBe(true);
    expect(seen.details.project).toMatchObject({ id: "p1", brandName: "Laundry", ownerName: "Dewi", startIso: "2026-10-01", dueIso: "2026-11-01" });
    expect((seen.items.rowsData as Map<string, unknown>).size).toBe(3);
  });

  it("has the header status chip and a Back to projects link, with no Edit or All details", () => {
    const { container } = render(view());
    // The header's actions area; the details card (mocked here) is outside it.
    const header = container.querySelector("[data-page-actions]") as HTMLElement;
    expect(header).toBeTruthy();
    expect(within(header).getByRole("link", { name: "Back to projects" }).getAttribute("href")).toBe("/projects");
    expect(within(header).queryByText("All details")).toBeNull();
    expect(within(header).queryByText("Edit")).toBeNull();
  });
});
