// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

vi.mock("@/app/(app)/admin/users/actions", () => ({
  inviteMember: vi.fn(), resendMemberInvite: vi.fn(), revokeMemberInvite: vi.fn(), approveRequest: vi.fn(), rejectRequest: vi.fn(), undoRejectRequest: vi.fn(), resetInviteLink: vi.fn(), toggleInviteLink: vi.fn(), previewMerge: vi.fn(), mergePerson: vi.fn(), saveLoginEmail: vi.fn(), savePassword: vi.fn(), setUserActive: vi.fn(), saveUser: vi.fn(), addPerson: vi.fn(),
}));
vi.mock("@/app/(app)/admin/lists/actions", () => ({ saveRequestType: vi.fn(), saveBrand: vi.fn(), saveDivision: vi.fn(), saveDivisionCalendar: vi.fn() }));
vi.mock("@/lib/joinDeps", () => ({
  loadJoinAdmin: async () => ({ workspace: { joinCode: "abc123", joinLinkEnabled: true, emailDomain: null }, requests: { pending: [], rejected: [] } }),
  requestBaseUrl: async () => "https://cloworks.test",
}));
const requireUser = vi.fn();
const prismaMock = vi.hoisted(() => ({
  user: { findMany: vi.fn(), findUnique: vi.fn(async (): Promise<{ email: string | null } | null> => null) },
  brand: { findMany: vi.fn() }, division: { findMany: vi.fn() }, requestType: { findMany: vi.fn() },
}));
// Pages read through the workspace-scoped client that requireScope hands them.
vi.mock("@/lib/session", () => ({
  requireUser: () => requireUser(),
  requireUserOrRedirect: () => requireUser(),
  requireScope: async () => ({ user: await requireUser(), db: prismaMock }),
}));

import { activeChip, appRoleChip, enumLabel, jobRoleChip } from "@/lib/adminChips";
import { UsersContent } from "@/app/(app)/admin/users/UsersContent";
import { ListsContent } from "@/app/(app)/admin/lists/ListsContent";
import { CalendarContent } from "@/app/(app)/admin/calendar/CalendarContent";
import { ActiveToggle } from "@/app/(app)/admin/users/UserForms";
import { AdminSkeleton } from "@/components/PageSkeletons";
import AppError from "@/app/(app)/error";
import AppNotFound from "@/app/(app)/not-found";

const base = { fullName: "Rina Putri", title: "Designer II", aliases: [], department: null };
const users = [
  { ...base, id: "u1", name: "Rina", appRole: "ADMIN", jobRole: "DESIGNER", email: "rina@gmail.com", active: true, passwordHash: "scrypt$32768$8$1$c2FsdA==$SECRETHASH" },
  { ...base, id: "u2", name: "Budi", title: null, appRole: "REQUESTER", jobRole: "SOCIAL_MEDIA", email: null, active: false, passwordHash: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "a", appRole: "ADMIN", jobRole: "OTHER" });
  prismaMock.user.findMany.mockResolvedValue(users);
  prismaMock.brand.findMany.mockResolvedValue([{ id: "b1", name: "Clogent" }, { id: "b2", name: "Zed" }]);
  prismaMock.division.findMany.mockResolvedValue([{ id: "d1", name: "Marketing", color: "div-1", onMarketingCalendar: false, sortOrder: 0, leads: [] }]);
  prismaMock.requestType.findMany.mockResolvedValue([{ id: "t1", name: "Video", active: false, fieldSchema: [] }]);
});
afterEach(cleanup);

describe("admin chips", () => {
  it("app role tones, job roles neutral, active flag; labels are the text", () => {
    expect(appRoleChip("ADMIN")).toEqual({ label: "Admin", tone: "first-look" });
    expect(appRoleChip("LEAD")).toEqual({ label: "Lead", tone: "in-progress" });
    expect(appRoleChip("CREATIVE")).toEqual({ label: "Creative", tone: "done" });
    expect(appRoleChip("REQUESTER")).toEqual({ label: "Requester", tone: "requested" });
    expect(jobRoleChip("SOCIAL_MEDIA")).toEqual({ label: "Social media", tone: "tag-neutral" });
    expect(activeChip(true)).toEqual({ label: "Active", tone: "done" });
    expect(activeChip(false)).toEqual({ label: "Inactive", tone: "tag-neutral" });
    expect(enumLabel("DESIGNER")).toBe("Designer");
  });
});

describe("Users page", () => {
  it("one h1 via PageHeader, the Settings tabs, a Settings breadcrumb, card headings", async () => {
    render(await UsersContent());
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["People and access"]);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Account", "Members", "Lists", "Marketing calendar"]);
    expect(within(nav).getByRole("link", { name: "Members" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Lists" }).getAttribute("href")).toBe("/admin/lists");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).not.toContain("Admin");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Invite link"]);
  });
  it("table: avatar + name + full name/title, role chips, login email, active chip, unique Edit summaries", async () => {
    render(await UsersContent());
    const table = screen.getByRole("table", { name: "All people" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Job role", "App role", "Login email", "Status", "Manage"]);
    const rina = screen.getByRole("row", { name: /^Rina/ });
    expect(rina.querySelector('[aria-hidden="true"]')!.textContent).toBe("RI");
    expect(rina.textContent).toContain("Rina Putri");
    expect(rina.textContent).toContain("Designer II");
    const chip = (attr: string) => rina.querySelector(`[${attr}]`)!;
    expect([chip("data-app-role").textContent, chip("data-app-role").getAttribute("data-tone")]).toEqual(["Admin", "first-look"]);
    expect([chip("data-job-role").textContent, chip("data-job-role").getAttribute("data-tone")]).toEqual(["Designer", "tag-neutral"]);
    expect([chip("data-active").textContent, chip("data-active").getAttribute("data-tone")]).toEqual(["Active", "done"]);
    const budi = screen.getByRole("row", { name: /^Budi/ });
    expect(budi.querySelector("[data-active]")!.textContent).toBe("Inactive");
    expect(within(budi).getByText("No login")).toBeTruthy();
    // Each person's forms sit under a collapsed "Edit <name>" disclosure.
    for (const name of ["Rina", "Budi"]) {
      const toggle = screen.getByRole("button", { name: `Edit ${name}` });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(toggle);
    }
    expect(screen.getByRole("button", { name: "Save changes for Rina" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reactivate Budi" })).toBeTruthy();
  });
  it("no Allowed emails section: access is an active person with a login email", async () => {
    const { container } = render(await UsersContent());
    expect(container.textContent).not.toMatch(/allowed/i);
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });
  it("the confirm step uses the kit danger button", () => {
    render(<ActiveToggle u={{ ...users[0], title: null, hasPassword: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Rina" }));
    expect(screen.getByRole("button", { name: "Yes, deactivate Rina" }).className).toContain("bg-destructive");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});

describe("Lists page", () => {
  it("a request type panel keeps what was typed when it is collapsed and opened again", async () => {
    render(await ListsContent());
    const toggle = screen.getByText("Video").closest("button")!;
    fireEvent.click(toggle);
    const panel = toggle.parentElement!;
    fireEvent.change(within(panel).getByLabelText("Field schema (JSON array)"), { target: { value: '[{"key":"x"}]' } });
    fireEvent.click(toggle);
    expect(within(panel).queryByRole("button", { name: "Save type Video" })).toBeNull();
    fireEvent.click(toggle);
    expect((within(panel).getByLabelText("Field schema (JSON array)") as HTMLTextAreaElement).value).toBe('[{"key":"x"}]');
  });
  it("PageHeader + switcher, three cards, unique rename buttons, type status chip", async () => {
    render(await ListsContent());
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Brands, divisions and request types"]);
    expect(within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("link", { name: "Lists" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Brands", "Divisions", "Request types"]);
    expect(screen.getByRole("button", { name: "Rename Clogent" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rename Zed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add brand" })).toBeTruthy();
    expect(screen.getByLabelText("Name of Clogent")).toBeTruthy();
    const toggle = screen.getByText("Video").closest("button")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(toggle).getByText("Inactive").getAttribute("data-tone")).toBe("tag-neutral");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Save type Video" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Add request type" })).toBeTruthy();
  });
});

describe("Lists page without calendar settings", () => {
  it("points to the Marketing calendar tab instead of folding calendar settings under each division", async () => {
    render(await ListsContent());
    expect(screen.queryByText(/Marketing calendar settings/)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    const divisions = screen.getByRole("region", { name: "Divisions" });
    expect(within(divisions).getByRole("link", { name: "Marketing calendar" }).getAttribute("href")).toBe("/admin/calendar");
  });
});

describe("Marketing calendar settings page", () => {
  beforeEach(() => {
    prismaMock.division.findMany.mockResolvedValue([
      { id: "d1", name: "KOL", color: "div-3", onMarketingCalendar: true, sortOrder: 3, leads: [{ userId: "u1" }] },
      { id: "d2", name: "Creative", color: "div-1", onMarketingCalendar: false, sortOrder: 0, leads: [] },
    ]);
  });

  it("is a Settings tab with one open row per division: colour, switch, order, leads and its own Save", async () => {
    render(await CalendarContent());
    expect(screen.getByRole("heading", { level: 1, name: "Marketing calendar" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("link", { name: "Marketing calendar" }).getAttribute("aria-current")).toBe("page");
    const rows = within(screen.getByRole("list", { name: "Divisions" })).getAllByRole("listitem");
    expect(rows.map((r) => r.querySelector("[data-division-name]")!.textContent)).toEqual(["KOL", "Creative"]);
    expect(within(rows[0]).getByRole("switch", { name: "On the calendar" }).getAttribute("aria-checked")).toBe("true");
    expect(within(rows[1]).getByRole("switch", { name: "On the calendar" }).getAttribute("aria-checked")).toBe("false");
    expect(within(rows[0]).getByRole("button", { name: "Leads of KOL: Rina" })).toBeTruthy();
    expect(within(rows[1]).getByRole("button", { name: "Save calendar settings for Creative" })).toBeTruthy();
    expect(prismaMock.division.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }));
  });

  it("sends an admin with no divisions to Lists", async () => {
    prismaMock.division.findMany.mockResolvedValue([]);
    render(await CalendarContent());
    expect(screen.getByRole("link", { name: "Add divisions in Lists" }).getAttribute("href")).toBe("/admin/lists");
  });

  it("refuses non-admins before reading anything", async () => {
    requireUser.mockResolvedValue({ id: "x", appRole: "LEAD", jobRole: "OTHER" });
    render(await CalendarContent());
    expect(within(screen.getByRole("alert")).getByRole("heading", { level: 1 }).textContent).toBe("403 · Access denied");
    expect(prismaMock.division.findMany).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});

describe("admin denied, skeletons, error and not-found", () => {
  it("non-admins get the 403 EmptyState (lock, h1, link back) and no data", async () => {
    requireUser.mockResolvedValue({ id: "x", appRole: "LEAD", jobRole: "OTHER" });
    const { container } = render(await UsersContent());
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { level: 1 }).textContent).toBe("403 · Access denied");
    expect(alert.textContent).toContain("Admin pages are only available to admins.");
    expect(screen.getByRole("link", { name: "Back to requests" }).getAttribute("href")).toBe("/requests");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
  it("admin fallback is a skeleton with a loading status", () => {
    const { container } = render(<AdminSkeleton label="Loading people…" />);
    expect(screen.getByRole("status").textContent).toContain("Loading people…");
    expect(container.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(5);
  });
  it("error page: EmptyState alert with h1, Try again, back to Requests and sign in", () => {
    render(<AppError error={new Error("x")} reset={() => {}} retry={() => {}} />);
    expect(within(screen.getByRole("alert")).getByRole("heading", { level: 1, name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to requests" }).getAttribute("href")).toBe("/requests");
    expect(screen.getByRole("button", { name: "Try again" }).className).toContain("bg-primary");
  });
  it("in-shell not-found renders no <main> (the shell owns it) and links back", () => {
    const { container } = render(<AppNotFound />);
    expect(container.querySelector("main")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to requests/i }).getAttribute("href")).toBe("/requests");
  });
});
