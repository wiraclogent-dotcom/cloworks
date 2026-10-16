// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

const requireScope = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const revalidatePath = vi.hoisted(() => vi.fn());
const deps = vi.hoisted(() => ({ loadWaitlist: vi.fn(), setWaitlistStatusBy: vi.fn(), deleteWaitlistEntryBy: vi.fn() }));
const dbUser = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/session", () => ({ requireScope: () => requireScope() }));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/lib/waitlistDeps", () => deps);

import { AdminTabs } from "@/app/(app)/admin/AdminTabs";
import { WaitlistContent } from "@/app/(app)/admin/waitlist/WaitlistContent";
import { markWaitlist, deleteWaitlist } from "@/app/(app)/admin/waitlist/actions";

const rows = [
  { id: "e2", email: "new@acme.co", team: "Acme Studio", teamSize: "SIZE_6_15", status: "NEW", createdAt: new Date("2026-10-15T08:00:00Z"), contactedAt: null },
  { id: "e1", email: "old@beta.co", team: "Beta Co", teamSize: "SIZE_1_5", status: "CONTACTED", createdAt: new Date("2026-10-10T08:00:00Z"), contactedAt: new Date("2026-10-11T08:00:00Z") },
];

/** Signs in a viewer: `appRole` is the workspace role, `email` is what the user table says about them. */
const viewer = (appRole: "ADMIN" | "CREATIVE", email: string | null) => {
  requireScope.mockResolvedValue({ user: { id: "u1", appRole, workspaceId: "w1" }, db: { user: dbUser } });
  dbUser.findUnique.mockResolvedValue(email === null ? { email: null } : { email });
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PLATFORM_ADMIN_EMAILS = "boss@clogent.co.id, Other@Clogent.co.id";
  deps.loadWaitlist.mockResolvedValue(rows);
});
afterEach(() => {
  cleanup();
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

describe("AdminTabs", () => {
  it("has no Waitlist link by default", () => {
    render(<AdminTabs current="users" />);
    expect(screen.queryByRole("link", { name: /waitlist/i })).toBeNull();
  });

  it("links to /admin/waitlist when asked", () => {
    render(<AdminTabs current="users" waitlist />);
    expect(screen.getByRole("link", { name: /waitlist/i }).getAttribute("href")).toBe("/admin/waitlist");
  });

  it("marks Waitlist as the current page on its own tab", () => {
    render(<AdminTabs current="waitlist" waitlist />);
    expect(screen.getByRole("link", { name: /waitlist/i }).getAttribute("aria-current")).toBe("page");
  });
});

describe("WaitlistContent", () => {
  it("is a 404 for a workspace admin who is not a platform admin, and reads no rows", async () => {
    viewer("ADMIN", "admin@workspace.co");
    await expect(WaitlistContent()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(deps.loadWaitlist).not.toHaveBeenCalled();
  });

  it("is a 404 for a viewer whose email is null", async () => {
    viewer("ADMIN", null);
    await expect(WaitlistContent()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(deps.loadWaitlist).not.toHaveBeenCalled();
  });

  it("is a 404 for everyone when PLATFORM_ADMIN_EMAILS is unset", async () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    viewer("ADMIN", "boss@clogent.co.id");
    await expect(WaitlistContent()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(deps.loadWaitlist).not.toHaveBeenCalled();
  });

  it("lists the rows in the order given (newest first) for a platform admin", async () => {
    viewer("CREATIVE", "BOSS@clogent.co.id");
    render(await WaitlistContent());
    expect(notFound).not.toHaveBeenCalled();
    const body = screen.getAllByRole("row").slice(1);
    expect(body).toHaveLength(2);
    expect(within(body[0]).getByRole("link", { name: "new@acme.co" }).getAttribute("href")).toBe("mailto:new@acme.co");
    expect(within(body[0]).getByText("Acme Studio")).toBeTruthy();
    expect(within(body[0]).getByText("6–15")).toBeTruthy();
    expect(within(body[0]).getByText("New").getAttribute("data-tone")).toBe("tag-neutral");
    expect(within(body[1]).getByRole("link", { name: "old@beta.co" })).toBeTruthy();
    expect(within(body[1]).getByText("1–5")).toBeTruthy();
    expect(within(body[1]).getByText("Contacted").getAttribute("data-tone")).toBe("done");
  });

  it("shows the Waitlist tab and the row count", async () => {
    viewer("ADMIN", "other@clogent.co.id");
    render(await WaitlistContent());
    expect(screen.getByRole("heading", { level: 1, name: "Waitlist" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /waitlist/i }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("offers mark-contacted for a new row, undo for a contacted one, and a confirmed delete", async () => {
    viewer("ADMIN", "boss@clogent.co.id");
    render(await WaitlistContent());
    expect(screen.getByRole("button", { name: /mark acme studio as contacted/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /mark beta co as new again/i })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^delete /i })).toHaveLength(2);
  });

  it("says so when nobody is on the list", async () => {
    viewer("ADMIN", "boss@clogent.co.id");
    deps.loadWaitlist.mockResolvedValue([]);
    render(await WaitlistContent());
    expect(screen.getByText("No one on the waitlist yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("waitlist actions", () => {
  it("markWaitlist is a 404 and writes nothing for a non-platform admin", async () => {
    viewer("ADMIN", "admin@workspace.co");
    await expect(markWaitlist("e1", "CONTACTED")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(deps.setWaitlistStatusBy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("deleteWaitlist is a 404 and deletes nothing for a non-platform admin", async () => {
    viewer("ADMIN", "admin@workspace.co");
    await expect(deleteWaitlist("e1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(deps.deleteWaitlistEntryBy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("both actions are a 404 for a viewer with a null email", async () => {
    viewer("ADMIN", null);
    await expect(markWaitlist("e1", "NEW")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(deleteWaitlist("e1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(deps.setWaitlistStatusBy).not.toHaveBeenCalled();
    expect(deps.deleteWaitlistEntryBy).not.toHaveBeenCalled();
  });

  it("both actions are a 404 when PLATFORM_ADMIN_EMAILS is unset", async () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    viewer("ADMIN", "boss@clogent.co.id");
    await expect(markWaitlist("e1", "NEW")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(deleteWaitlist("e1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(deps.setWaitlistStatusBy).not.toHaveBeenCalled();
    expect(deps.deleteWaitlistEntryBy).not.toHaveBeenCalled();
  });

  it("markWaitlist updates the status then revalidates for a platform admin", async () => {
    viewer("CREATIVE", "boss@clogent.co.id");
    await markWaitlist("e1", "CONTACTED");
    expect(deps.setWaitlistStatusBy).toHaveBeenCalledWith("e1", "CONTACTED");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/waitlist");
    await markWaitlist("e1", "NEW");
    expect(deps.setWaitlistStatusBy).toHaveBeenLastCalledWith("e1", "NEW");
  });

  it("markWaitlist ignores a status other than NEW or CONTACTED", async () => {
    viewer("ADMIN", "boss@clogent.co.id");
    await markWaitlist("e1", "BOGUS" as never);
    expect(deps.setWaitlistStatusBy).not.toHaveBeenCalled();
  });

  it("deleteWaitlist deletes then revalidates for a platform admin", async () => {
    viewer("ADMIN", "other@clogent.co.id");
    await deleteWaitlist("e1");
    expect(deps.deleteWaitlistEntryBy).toHaveBeenCalledWith("e1");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/waitlist");
  });
});
