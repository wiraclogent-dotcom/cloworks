// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("@/app/(app)/requests/[id]/actions", () => ({
  addComment: vi.fn(), addAttachment: vi.fn(), assignRequest: vi.fn(), removeAttachment: vi.fn(), setIncludeKpi: vi.fn(), setNeedsMotion: vi.fn(),
}));
vi.mock("@/app/(app)/requests/actions", () => ({ moveRequest: vi.fn(), rescheduleRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RequestDetailView, type RequestDetail } from "@/app/(app)/requests/[id]/RequestDetailView";
import { Switch } from "@/components/ui/Switch";

afterEach(cleanup);

const base = (extra: Partial<RequestDetail> = {}): RequestDetail => ({
  id: "r1", title: "Launch poster", status: "ON_PROGRESS", needsMotion: false, includeKpi: true,
  briefUrl: "https://docs.example.com/brief", notes: "Line one\nLine two", designFolderUrl: null, outputCount: 3,
  requestedAt: new Date("2026-10-01T03:00:00Z"), deadline: new Date("2026-10-09T00:00:00Z"), assigneeId: "u2",
  brand: { name: "Clogent" }, division: { name: "Marketing" }, type: { name: "General Design" },
  requester: { name: "Rina Sari" }, assignee: { name: "Cami Putri" },
  deadlineEvents: [],
  statusEvents: [
    { id: "e1", from: null, to: "REQUESTED", at: new Date("2026-10-01T03:00:00Z"), actor: { name: "Rina Sari" } },
    { id: "e2", from: "REQUESTED", to: "ON_PROGRESS", at: new Date("2026-10-02T04:30:00Z"), actor: { name: "Lead" } },
  ],
  comments: [{ id: "c1", body: "Thanks @Cami for this", createdAt: new Date("2026-10-02T05:00:00Z"), author: { name: "Rina Sari" } }],
  attachments: [
    { id: "a1", name: "Logo pack", url: "https://drive.example.com/a", createdAt: new Date("2026-10-02T00:00:00Z"), uploaderId: "me", uploader: { name: "Me" } },
    { id: "a2", name: "Old draft", url: "https://drive.example.com/b", createdAt: new Date("2026-10-02T00:00:00Z"), uploaderId: "other", uploader: { name: "Other" } },
  ],
  ...extra,
});
type Perm = { canAssign: boolean; canMove: boolean };
const REQUESTER: Perm = { canAssign: false, canMove: false };
const CREATIVE: Perm = { canAssign: false, canMove: true };
const LEAD: Perm = { canAssign: true, canMove: true };
const view = (req = base(), perm: Perm = LEAD, daysLeft: number | null = 2) =>
  render(<RequestDetailView req={req} extra={[]} daysLeft={daysLeft} userId="me" {...perm} assignees={[{ id: "u2", name: "Cami Putri" }]} />);
const card = (title: string) => screen.getByRole("heading", { level: 2, name: new RegExp(`^${title}`) }).closest("section")!;

describe("RequestDetailView header", () => {
  it("one h1 with the title, a Requests back link, then section headings in order", () => {
    view();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Launch poster"]);
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Requests" }).getAttribute("href")).toBe("/requests");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent!.replace(/\d+$/, "").trim()))
      .toEqual(["Brief", "Attachments", "Comments", "Activity", "Details", "Manage"]);
  });

  it("chips row: status, Needs motion only when flagged, and the KPI chip as text", () => {
    view();
    const chips = document.querySelector("[data-detail-chips]") as HTMLElement;
    expect(within(chips).getByText("On progress")).toBeTruthy();
    expect(within(chips).queryByText("Needs motion")).toBeNull();
    expect(within(chips).getByText("Counts toward KPI")).toBeTruthy();
    cleanup();
    view(base({ needsMotion: true, includeKpi: false }));
    const c2 = document.querySelector("[data-detail-chips]") as HTMLElement;
    expect(within(c2).getByText("Needs motion")).toBeTruthy();
    expect(within(c2).getByText("Not counted toward KPI")).toBeTruthy();
  });
});

describe("RequestDetailView sections", () => {
  it("Brief: an Open brief link (new tab) and notes kept with line breaks", () => {
    view();
    const brief = within(card("Brief"));
    const link = brief.getByRole("link", { name: /Open brief/ });
    expect(link.getAttribute("href")).toBe("https://docs.example.com/brief");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    const notes = brief.getByText(/Line one/);
    expect(notes.className).toMatch(/whitespace-pre-wrap/);
  });

  it("Details: avatars for people, brand tag, deadline chip for open requests, outputs only when done", () => {
    view();
    const d = within(card("Details"));
    expect(d.getByText("Rina Sari").previousElementSibling?.textContent).toBe("RS");
    expect(d.getByText("Cami Putri").previousElementSibling?.textContent).toBe("CP");
    expect(d.getByText("Clogent").getAttribute("data-tone")).toBe("tag-clogent");
    expect(d.getByText("2 days left").getAttribute("data-deadline")).toBe("due-soon");
    expect(d.queryByText("Outputs")).toBeNull();
    cleanup();
    view(base({ status: "DONE", assignee: null, assigneeId: null, designFolderUrl: "https://drive.example.com/f" }), LEAD, -1);
    const d2 = within(card("Details"));
    expect(d2.getByText("Outputs")).toBeTruthy();
    expect(d2.queryByText(/Overdue/)).toBeNull();
    expect(d2.getByText("Unassigned")).toBeTruthy();
    expect(d2.getByRole("link", { name: /Open folder/ }).getAttribute("href")).toBe("https://drive.example.com/f");
  });

  it("Comments: avatar, name, Jakarta time and highlighted mentions", () => {
    view();
    const c = within(card("Comments"));
    expect(c.getByText("02 Oct 2026, 12:00 WIB")).toBeTruthy();
    const mention = c.getByText("@Cami");
    expect(mention.tagName).toBe("STRONG");
    expect(mention.className).toMatch(/bg-accent/);
    expect(c.getByLabelText("Add a comment").tagName).toBe("TEXTAREA");
    expect(c.getByRole("button", { name: "Post comment" }).className).toMatch(/bg-primary/);
  });

  it("Activity: a timeline with a status-coloured dot per event", () => {
    view();
    const a = card("Activity");
    const dots = [...a.querySelectorAll("[data-timeline] li > span[data-tone]")].map((d) => d.getAttribute("data-tone"));
    expect(dots).toEqual(["requested", "in-progress"]);
    expect(a.textContent).toContain("Created as Requested");
    expect(a.textContent).toContain("Requested → On progress");
    expect(a.textContent).toContain("02 Oct 2026, 11:30 WIB");
  });

  it("Attachments: Remove only for the uploader or people who can assign", () => {
    view(base(), REQUESTER);
    const att = within(card("Attachments"));
    expect(att.getByRole("button", { name: "Remove link “Logo pack”" })).toBeTruthy();
    expect(att.queryByRole("button", { name: "Remove link “Old draft”" })).toBeNull();
    cleanup();
    view(base(), LEAD);
    expect(within(card("Attachments")).getAllByRole("button", { name: /^Remove link/ })).toHaveLength(2);
  });
});

describe("RequestDetailView Manage card per permission", () => {
  it("requesters see no Manage card", () => {
    view(base(), REQUESTER);
    expect(screen.queryByRole("heading", { name: "Manage" })).toBeNull();
    expect(screen.queryByLabelText("Move to…")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
  it("creatives can move but not assign or toggle", () => {
    view(base(), CREATIVE);
    const m = within(card("Manage"));
    expect(m.getByLabelText("Move to…")).toBeTruthy();
    expect(m.queryByLabelText("Assignee")).toBeNull();
    expect(m.queryByRole("switch")).toBeNull();
  });
  it("leads get the assignee picker, Move to… and both switches", () => {
    view(base(), LEAD);
    const m = within(card("Manage"));
    expect((m.getByLabelText("Assignee") as HTMLSelectElement).value).toBe("u2");
    expect(m.getByLabelText("Move to…")).toBeTruthy();
    expect(m.getByText("Choose Cancelled to cancel this request.")).toBeTruthy();
    expect((m.getByRole("switch", { name: "Counts toward KPI" }) as HTMLInputElement).checked).toBe(true);
    expect((m.getByRole("switch", { name: "Needs motion" }) as HTMLInputElement).checked).toBe(false);
  });
  it("hides the assignee picker on a cancelled request", () => {
    view(base({ status: "CANCELLED" }), LEAD);
    expect(within(card("Manage")).queryByLabelText("Assignee")).toBeNull();
  });
});

describe("Switch", () => {
  it("is a checkbox with role switch, named by its label, and the focus ring on the track", () => {
    render(<Switch id="s" label="Counts toward KPI" checked={false} onChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "Counts toward KPI" }) as HTMLInputElement;
    expect(sw.type).toBe("checkbox");
    expect(sw.checked).toBe(false);
    const track = document.querySelector("[data-switch-track]")!;
    expect(track.className).toMatch(/peer-focus-visible:outline-ring/);
    expect(track.className).toMatch(/peer-checked:bg-primary/);
  });
});

describe("Activity and Change deadline", () => {
  it("interleaves status and deadline events by time with short Jakarta dates", () => {
    view(base({ deadlineEvents: [
      { id: "d1", from: null, to: new Date("2026-10-13T17:00:00Z"), at: new Date("2026-10-01T03:30:00Z"), actor: { name: "Lead" } },
      { id: "d2", from: new Date("2026-10-09T17:00:00Z"), to: new Date("2026-10-13T17:00:00Z"), at: new Date("2026-10-03T03:00:00Z"), actor: { name: "Cami Putri" } },
    ] }));
    const items = Array.from(document.querySelectorAll("[data-timeline] > li")).map((li) => li.textContent!);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatch(/Created as/);
    expect(items[1]).toMatch(/Deadline set to 14 Oct/);
    expect(items[2]).toMatch(/Requested → On progress/);
    expect(items[3]).toMatch(/Deadline moved from 10 Oct to 14 Oct/);
    expect(items[3]).toMatch(/Cami Putri/);
  });
  it("shows No activity yet. when there are no events", () => {
    view(base({ statusEvents: [], deadlineEvents: [] }));
    expect(screen.getByText("No activity yet.")).toBeTruthy();
  });
  it("shows the deadline control only for movers on open requests", () => {
    view(base(), CREATIVE);
    expect(screen.getByLabelText("Change deadline", { selector: "input" })).toBeTruthy();
    cleanup();
    view(base({ status: "DONE" }), CREATIVE);
    expect(screen.queryByLabelText("Change deadline", { selector: "input" })).toBeNull();
    cleanup();
    view(base(), REQUESTER);
    expect(screen.queryByLabelText("Change deadline", { selector: "input" })).toBeNull();
  });
});
