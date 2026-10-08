// @vitest-environment jsdom
/** QA fix round 1 (docs/superpowers/reports/2026-10-08-redesign-qa.md): markup/class contracts jsdom can check. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";

vi.mock("@/app/(app)/dashboard/targets/actions", () => ({ setTarget: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/requests" }));
vi.mock("@/lib/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "font-inter" }) }));
vi.mock("@/lib/session", () => ({ requireUserOrRedirect: vi.fn(), requireUser: vi.fn() }));

import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TeamTable, type TeamRow } from "@/components/kpi/TeamTable";
import { RequestTable } from "@/components/RequestTable";
import { Avatar } from "@/components/ui/Avatar";
import { AppFrame } from "@/components/shell/AppFrame";
import SignInPage from "@/app/signin/page";
import { metadata as rootMeta } from "@/app/layout";
import { metadata as requestsMeta } from "@/app/(app)/requests/page";
import { metadata as newRequestMeta } from "@/app/(app)/requests/new/page";
import { metadata as detailMeta } from "@/app/(app)/requests/[id]/page";
import { metadata as kpiMeta } from "@/app/(app)/dashboard/page";
import { metadata as teamMeta } from "@/app/(app)/dashboard/team/page";
import { metadata as projectsMeta } from "@/app/(app)/projects/page";
import { metadata as usersMeta } from "@/app/(app)/admin/users/page";
import { metadata as listsMeta } from "@/app/(app)/admin/lists/page";
import { metadata as signinMeta } from "@/app/signin/page";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("D2/D7 PageHeader wraps on narrow screens", () => {
  it("title block takes a full row below sm and keeps ≥ 10rem from sm; actions wrap", () => {
    render(<PageHeader title="Requests" count={552}
      switcher={<SegmentedControl label="View" value="board" items={[{ value: "board", label: "Board", href: "/requests" }, { value: "table", label: "Table", href: "/requests?view=table" }]} />} />);
    const title = document.querySelector("[data-page-title]")!;
    const cls = title.className.split(" ");
    expect(cls).toEqual(expect.arrayContaining(["basis-full", "grow", "min-w-0", "sm:basis-0", "sm:min-w-[10rem]"]));
    expect(cls).not.toContain("flex-1");
    expect(title.parentElement!.className).toContain("flex-wrap");
    expect(document.querySelector("[data-page-actions]")!.className).toContain("flex-wrap");
    expect(screen.getByRole("heading", { level: 1, name: "Requests" })).toBeTruthy();
  });
});

const kpi = { tasksDone: 3, target: 5, progress: 0.6, onTimeRate: 1, avgTurnaroundDays: 1.2, revisionRounds: 0, totalOutputs: 3, activeWorkload: 1 };
const rows: TeamRow[] = [{ userId: "u1", name: "Fadli", role: "DESIGNER", kpi }, { userId: "u2", name: "Sari", role: "SOCIAL_MEDIA", kpi }];

describe("D4 Team KPI table fits at ≥ 1024px", () => {
  it("no min width from lg, secondary columns only from xl, scroll hint below lg", () => {
    const { container } = render(<TeamTable rows={rows} month="2026-10" canEdit />);
    const table = screen.getByRole("table");
    expect(table.className).toContain("lg:min-w-0");
    for (const name of ["Turnaround (days)", "Workload"]) {
      const th = screen.getByRole("columnheader", { name });
      expect(th.className).toContain("hidden");
      expect(th.className).toContain("xl:table-cell");
    }
    expect(screen.getByRole("columnheader", { name: "Set target" }).className).toContain("w-48");
    const hint = container.querySelector("[data-scroll-hint]")!;
    expect(hint.textContent).toBe("Scroll sideways to see every column.");
    expect(hint.className).toContain("lg:hidden");
  });
  it("compact editor: icon-only Save keeps the unique accessible name; inputs keep their labels", () => {
    const { container } = render(<TeamTable rows={rows} month="2026-10" canEdit />);
    const save = screen.getByRole("button", { name: "Save target for Fadli" });
    expect(save.getAttribute("title")).toBe("Save target for Fadli");
    expect(save.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save target for Sari" })).toBeTruthy();
    expect(screen.getByLabelText("Target tasks for Fadli")).toBeTruthy();
    expect(screen.getByLabelText(/Note for Fadli/)).toBeTruthy();
    expect(container.querySelector("[data-target-editor]")!.className).toContain("max-w-48");
  });
});

describe("D8 tap targets", () => {
  it("sort header links are ≥ 32px tall, team name links ≥ 28px, small avatar initials 11px", () => {
    render(<RequestTable rows={[{ id: "a", title: "T", status: "REQUESTED", brandName: "Zed", divisionName: "D", requesterName: "Rina", assigneeName: null,
      requestedAt: new Date("2026-10-01T00:00:00Z"), deadline: null, outputCount: 0, daysLeft: null, needsMotion: false }]} sort="deadline" dir="asc" hrefFor={() => "/requests"} />);
    for (const h of screen.getAllByRole("columnheader")) expect(within(h).getByRole("link").className).toContain("min-h-8");
    cleanup();
    render(<TeamTable rows={rows} month="2026-10" canEdit={false} />);
    expect(screen.getByRole("link", { name: "Fadli" }).className).toContain("min-h-7");
    cleanup();
    const { container } = render(<Avatar name="Rina Sari" size="sm" />);
    expect(container.firstElementChild!.className).toContain("text-[11px]");
    expect(container.firstElementChild!.className).not.toMatch(/text-\[(9|10)px\]/);
  });
  it("mobile drawer: focus moves in even when the first focus() is a no-op (hidden until the transition starts)", () => {
    vi.useFakeTimers();
    const real = HTMLElement.prototype.focus;
    let blocked = true;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement) { if (!blocked) real.call(this); });
    render(<AppFrame nav={null} footer={null}><p>x</p></AppFrame>);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Close navigation" }));
    blocked = false;
    act(() => { vi.advanceTimersByTime(250); });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close navigation" }));
  });
});

describe("D11 per-page titles", () => {
  it("root template + static page titles", () => {
    expect(rootMeta.title).toEqual({ default: "Creative Tracker", template: "%s · Creative Tracker" });
    expect([requestsMeta, newRequestMeta, detailMeta, kpiMeta, teamMeta, projectsMeta, usersMeta, listsMeta, signinMeta].map((m) => m.title)).toEqual(
      ["Requests", "New request", "Request", "My KPI", "Team KPI", "Projects", "Admin · Users", "Admin · Lists", "Sign in"]);
  });
});

describe("D10 sign-in brand band", () => {
  it("Deep Blue band with the logo, name and tagline above the unchanged form card", async () => {
    await act(async () => { render(<SignInPage searchParams={Promise.resolve({})} />); });
    const band = document.querySelector("[data-brand-band]")!;
    expect(band.className).toContain("bg-sidebar");
    expect(band.className).toContain("border-brand-aqua");
    expect(band.textContent).toContain("Creative Tracker");
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue with microsoft/i })).toBeTruthy();
  });
});
