// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

vi.mock("@/app/(app)/admin/users/actions", () => ({
  saveLoginEmail: vi.fn(), setUserActive: vi.fn(), removeAllowed: vi.fn(), saveUser: vi.fn(), addPerson: vi.fn(), addAllowed: vi.fn(),
}));
vi.mock("@/app/(app)/admin/lists/actions", () => ({ saveRequestType: vi.fn(), saveBrand: vi.fn(), saveDivision: vi.fn() }));
const requireUser = vi.fn();
vi.mock("@/lib/session", () => ({ requireUser: () => requireUser(), requireUserOrRedirect: () => requireUser() }));
const prismaMock = vi.hoisted(() => ({
  user: { findMany: vi.fn() }, allowedEmail: { findMany: vi.fn() },
  brand: { findMany: vi.fn() }, division: { findMany: vi.fn() }, requestType: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { activeChip, appRoleChip, enumLabel, jobRoleChip } from "@/lib/adminChips";
import { UsersContent } from "@/app/(app)/admin/users/UsersContent";
import { ListsContent } from "@/app/(app)/admin/lists/ListsContent";
import { RemoveAllowed, ActiveToggle } from "@/app/(app)/admin/users/UserForms";
import { AdminSkeleton } from "@/components/PageSkeletons";
import AppError from "@/app/(app)/error";
import AppNotFound from "@/app/(app)/not-found";

const base = { fullName: "Rina Putri", title: "Designer II", aliases: [], department: null };
const users = [
  { ...base, id: "u1", name: "Rina", appRole: "ADMIN", jobRole: "DESIGNER", email: "rina@gmail.com", active: true },
  { ...base, id: "u2", name: "Budi", title: null, appRole: "REQUESTER", jobRole: "SOCIAL_MEDIA", email: null, active: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "a", appRole: "ADMIN", jobRole: "OTHER" });
  prismaMock.user.findMany.mockResolvedValue(users);
  prismaMock.allowedEmail.findMany.mockResolvedValue([{ id: "e1", email: "rina@gmail.com", note: null }, { id: "e2", email: "x@y.test", note: "vendor" }]);
  prismaMock.brand.findMany.mockResolvedValue([{ id: "b1", name: "Clogent" }, { id: "b2", name: "Zed" }]);
  prismaMock.division.findMany.mockResolvedValue([{ id: "d1", name: "Marketing" }]);
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
  it("one h1 via PageHeader, Users | Lists switcher, card headings", async () => {
    render(await UsersContent());
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["People and access"]);
    const nav = screen.getByRole("navigation", { name: "Admin sections" });
    expect(within(nav).getByRole("link", { name: "Users" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Lists" }).getAttribute("href")).toBe("/admin/lists");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Add person", "Allowed emails"]);
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
    expect(screen.getByText("Edit Rina").closest("summary")).not.toBeNull();
    expect(screen.getByText("Edit Budi").closest("summary")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save changes for Rina" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reactivate Budi" })).toBeTruthy();
  });
  it("allowed emails card with per-row remove buttons", async () => {
    render(await UsersContent());
    expect(screen.getByText("Used by Rina")).toBeTruthy();
    expect(screen.getByText("Not linked to a person · vendor")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove rina@gmail.com" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove x@y.test" })).toBeTruthy();
  });
  it("the confirm step uses the kit danger button; triggers are danger-text ghost buttons", () => {
    render(<RemoveAllowed email="a@gmail.com" />);
    const trigger = screen.getByRole("button", { name: "Remove a@gmail.com" });
    expect(trigger.className).toContain("text-danger");
    fireEvent.click(trigger);
    const group = screen.getByRole("group", { name: "Confirm: Remove" });
    expect(group.getAttribute("data-tone")).toBe("cancelled");
    expect(within(group).getByRole("button", { name: "Yes, remove a@gmail.com" }).className).toContain("bg-destructive");
    expect(within(group).getByRole("button", { name: "Cancel" })).toBeTruthy();
    cleanup();
    render(<ActiveToggle u={{ ...users[0], title: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Rina" }));
    expect(screen.getByRole("button", { name: "Yes, deactivate Rina" }).className).toContain("bg-destructive");
  });
});

describe("Lists page", () => {
  it("PageHeader + switcher, three cards, unique rename buttons, type status chip", async () => {
    render(await ListsContent());
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Brands, divisions and request types"]);
    expect(within(screen.getByRole("navigation", { name: "Admin sections" })).getByRole("link", { name: "Lists" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Brands", "Divisions", "Request types"]);
    expect(screen.getByRole("button", { name: "Rename Clogent" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rename Zed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add brand" })).toBeTruthy();
    expect(screen.getByLabelText("Name of Clogent")).toBeTruthy();
    const summary = screen.getByText("Video").closest("summary")!;
    expect(within(summary).getByText("Inactive").getAttribute("data-tone")).toBe("tag-neutral");
    expect(screen.getByRole("button", { name: "Save type Video" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Add request type" })).toBeTruthy();
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
    render(<AppError error={new Error("x")} reset={() => {}} />);
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
