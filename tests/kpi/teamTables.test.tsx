// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("@/app/(app)/dashboard/targets/actions", () => ({ setTarget: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { TeamTable, type TeamRow } from "@/components/kpi/TeamTable";
import { ProjectTeamTable, type ProjectTeamRow } from "@/components/kpi/project/ProjectTeamTable";

afterEach(cleanup);

const kpi = { doneRequestIds: ["r1", "r2", "r3"], tasksDone: 3, target: 50, progress: 0.06, onTimeRate: 0.5, avgTurnaroundDays: 1.5, revisionRounds: 0, totalOutputs: 6, activeWorkload: 2 };
const reqRows: TeamRow[] = [{ userId: "u1", name: "Fadli", role: "DESIGNER", kpi }];
const projRows: ProjectTeamRow[] = [
  { userId: "u1", name: "Fadli", role: "DESIGNER", quarters: [null, null, null, 80], year: 80, done: 1, items: 2, onTimePct: 50, hasTargets: true },
  { userId: "u2", name: "Sari", role: "SOCIAL_MEDIA", quarters: [null, null, null, null], year: null, done: 0, items: 0, onTimePct: null, hasTargets: false },
];

const personCell = (name: string) => screen.getByText(name, { selector: "a, span" }).closest("th")!;

describe("shared person cell", () => {
  it("Requests and Projects render the same avatar + link + role chip structure", () => {
    const a = render(<TeamTable rows={reqRows} month="2026-10" canEdit />);
    const reqCell = personCell("Fadli");
    const reqLink = within(reqCell).getByRole("link", { name: "Fadli" });
    const reqHtml = { avatar: reqCell.querySelector("[aria-hidden='true'].rounded-full")?.className, link: reqLink.className, chip: within(reqCell).getByText("Designer").className, th: reqCell.className };
    a.unmount();
    render(<ProjectTeamTable rows={projRows} year={2026} />);
    const projCell = personCell("Fadli");
    const projLink = within(projCell).getByRole("link", { name: "Fadli" });
    expect(reqHtml.avatar).toBeTruthy();
    expect(projCell.querySelector("[aria-hidden='true'].rounded-full")?.className).toBe(reqHtml.avatar);
    expect(projLink.className).toBe(reqHtml.link);
    expect(within(projCell).getByText("Designer").className).toBe(reqHtml.chip);
    expect(projCell.className).toBe(reqHtml.th);
    expect(projLink.getAttribute("href")).toBe("/dashboard/projects/u1?year=2026");
    expect(within(personCell("Sari")).getByText("Social media")).toBeTruthy();
  });
  it("without permission the name is plain text with the same chip", () => {
    render(<ProjectTeamTable rows={projRows} year={2026} canOpen={false} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(within(personCell("Fadli")).getByText("Designer")).toBeTruthy();
  });
});

describe("TeamTable measured in posts", () => {
  it("says Posts approved and drops the request-only columns", () => {
    render(<TeamTable rows={[{ ...reqRows[0], role: "SOCIAL_MEDIA" }]} month="2026-10" canEdit={false} measure="posts" />);
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Person", "Posts approved", "Target", "Progress", "On-time"]);
    expect(screen.getByRole("table").querySelector("caption")!.textContent).toBe("Content Plan KPI per person for the selected month");
  });
  it("labels a social media person's target field in posts", () => {
    render(<TeamTable rows={[{ ...reqRows[0], role: "SOCIAL_MEDIA" }]} month="2026-10" canEdit measure="posts" />);
    expect(screen.getByRole("spinbutton", { name: "Target posts for Fadli" })).toBeTruthy();
  });
});

describe("both tables share the frame", () => {
  it("each has the sideways-scroll hint and a scroll wrapper inside the card", () => {
    const a = render(<TeamTable rows={reqRows} month="2026-10" canEdit />);
    const hintA = a.container.querySelector("[data-scroll-hint]")!;
    const wrapA = a.container.querySelector("table")!.parentElement!.className;
    expect(hintA.textContent).toBe("Scroll sideways to see every column.");
    a.unmount();
    const b = render(<ProjectTeamTable rows={projRows} year={2026} />);
    expect(b.container.querySelector("[data-scroll-hint]")!.textContent).toBe("Scroll sideways to see every column.");
    expect(b.container.querySelector("[data-scroll-hint]")!.className).toBe(hintA.className);
    expect(b.container.querySelector("table")!.parentElement!.className).toBe(wrapA);
  });
  it("numbers are right-aligned tabular and the action column is last", () => {
    const a = render(<TeamTable rows={reqRows} month="2026-10" canEdit />);
    const headsA = [...a.container.querySelectorAll("thead th")];
    expect(headsA[headsA.length - 1].textContent).toBe("Set target");
    expect(headsA[0].textContent).toBe("Person");
    expect(headsA[1].className).toMatch(/text-right.*tabular-nums/);
    a.unmount();
    const b = render(<ProjectTeamTable rows={projRows} year={2026} />);
    const headsB = [...b.container.querySelectorAll("thead th")];
    expect(headsB[headsB.length - 1].textContent).toBe("Targets");
    expect(headsB[0].textContent).toBe("Person");
    expect(headsB[1].className).toMatch(/text-right.*tabular-nums/);
  });
});

describe("ProjectTeamTable action column", () => {
  it("Set targets for people without targets, Open for the rest, both small buttons linking to the person's targets", () => {
    render(<ProjectTeamTable rows={projRows} year={2026} />);
    const set = screen.getByRole("link", { name: "Set targets for Sari" });
    const open = screen.getByRole("link", { name: "Open targets for Fadli" });
    expect(set.getAttribute("href")).toBe("/dashboard/projects/u2?year=2026");
    expect(open.getAttribute("href")).toBe("/dashboard/projects/u1?year=2026");
    expect(set.className).toBe(open.className);
    expect(set.closest("tr")!.textContent).toContain("Sari");
    // The inline green link next to the name is gone: Set targets lives only in the action column.
    expect(within(personCell("Sari")).queryByRole("link", { name: /Set targets/ })).toBeNull();
  });
  it("carries the team so the person's targets page leads back to it", () => {
    render(<ProjectTeamTable rows={projRows} year={2026} team="social" />);
    expect(screen.getByRole("link", { name: "Fadli" }).getAttribute("href")).toBe("/dashboard/projects/u1?year=2026&team=social");
    expect(screen.getByRole("link", { name: "Open targets for Fadli" }).getAttribute("href")).toBe("/dashboard/projects/u1?year=2026&team=social");
  });
  it("is omitted without dashboard.team", () => {
    render(<ProjectTeamTable rows={projRows} year={2026} canOpen={false} />);
    expect(screen.queryByRole("columnheader", { name: "Targets" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Open targets/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Set targets/ })).toBeNull();
  });
});
