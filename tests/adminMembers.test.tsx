// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";

const act = vi.hoisted(() => ({
  inviteMember: vi.fn(), resendMemberInvite: vi.fn(), revokeMemberInvite: vi.fn(), approveRequest: vi.fn(), rejectRequest: vi.fn(),
  undoRejectRequest: vi.fn(), resetInviteLink: vi.fn(), toggleInviteLink: vi.fn(),
  saveLoginEmail: vi.fn(), savePassword: vi.fn(), setUserActive: vi.fn(), saveUser: vi.fn(), addPerson: vi.fn(),
}));
vi.mock("@/app/(app)/admin/users/actions", () => act);
const requireUser = vi.fn();
const prismaMock = vi.hoisted(() => ({ user: { findMany: vi.fn() }, invite: { findMany: vi.fn() } }));
vi.mock("@/lib/session", () => ({
  requireUser: () => requireUser(),
  requireScope: async () => ({ user: await requireUser(), db: prismaMock }),
}));
const joinAdmin = vi.hoisted(() => ({ loadJoinAdmin: vi.fn(), requestBaseUrl: vi.fn() }));
vi.mock("@/lib/joinDeps", () => joinAdmin);

import { UsersContent } from "@/app/(app)/admin/users/UsersContent";

const when = (s: string) => new Date(s);
const pending = [
  { applicantId: "p1", name: "Andi", email: "andi@gmail.com", source: "LINK", requestedAt: when("2026-10-10T08:00:00Z"), rejectedAt: null },
  { applicantId: "p2", name: "Sari", email: "sari@clogent.co.id", source: "DOMAIN", requestedAt: when("2026-10-09T08:00:00Z"), rejectedAt: null },
  { applicantId: "p3", name: "Tono", email: "tono@gmail.com", source: "LINK", requestedAt: when("2026-10-08T08:00:00Z"), rejectedAt: null },
];
const rejected = [{ applicantId: "r1", name: "Rudi", email: "rudi@gmail.com", source: "LINK", requestedAt: when("2026-10-01T08:00:00Z"), rejectedAt: when("2026-10-02T08:00:00Z") }];
const future = new Date(Date.now() + 5 * 864e5);
const past = new Date(Date.now() - 2 * 864e5);

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "a", appRole: "ADMIN", jobRole: "OTHER", workspaceId: "w1" });
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.invite.findMany.mockResolvedValue([
    { id: "i1", email: "new@gmail.com", appRole: "CREATIVE", jobRole: "DESIGNER", expiresAt: future, invitedBy: { name: "Wira" } },
    { id: "i2", email: "old@gmail.com", appRole: "REQUESTER", jobRole: "OTHER", expiresAt: past, invitedBy: { name: "Wira" } },
  ]);
  joinAdmin.requestBaseUrl.mockResolvedValue("https://cloworks.test");
  joinAdmin.loadJoinAdmin.mockResolvedValue({
    workspace: { joinCode: "abc123", joinLinkEnabled: true, emailDomain: "clogent.co.id" },
    requests: { pending, rejected },
  });
});
afterEach(cleanup);

describe("Members page", () => {
  it("tabs: Members | Invited | Requests 3; Members is the default and the section tab says Members", async () => {
    render(await UsersContent({}));
    const nav = screen.getByRole("navigation", { name: "Member views" });
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Members", "Invited", "Requests 3"]);
    expect(within(nav).getByRole("link", { name: "Members" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Requests 3" }).getAttribute("href")).toBe("/admin/users?tab=requests");
    const sections = screen.getByRole("navigation", { name: "Admin sections" });
    expect(within(sections).getByRole("link", { name: "Members" }).getAttribute("href")).toBe("/admin/users");
    expect(screen.getByRole("heading", { name: "Add person" })).toBeTruthy();
  });

  it("invite link card: URL, Copy, Reset link, on/off switch and the domain line", async () => {
    render(await UsersContent({}));
    expect(screen.getByText("https://cloworks.test/join/abc123")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset link" })).toBeTruthy();
    expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("People with @clogent.co.id can request to join")).toBeTruthy();
  });

  it("no domain: the line is omitted; unknown base URL shows the path", async () => {
    joinAdmin.requestBaseUrl.mockResolvedValue("");
    joinAdmin.loadJoinAdmin.mockResolvedValue({ workspace: { joinCode: "abc123", joinLinkEnabled: false, emailDomain: null }, requests: { pending: [], rejected: [] } });
    render(await UsersContent({}));
    expect(screen.queryByText(/can request to join/)).toBeNull();
    expect(screen.getByText("/join/abc123")).toBeTruthy();
    expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(false);
  });

  it("the switch submits the opposite state; Reset link asks first", async () => {
    act.toggleInviteLink.mockResolvedValue({ ok: true, message: "Join link turned off.", values: {}, nonce: "t" });
    act.resetInviteLink.mockResolvedValue({ ok: true, message: "New link created.", values: {}, nonce: "r" });
    render(await UsersContent({}));
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(act.toggleInviteLink).toHaveBeenCalledTimes(1));
    expect((act.toggleInviteLink.mock.calls[0][1] as FormData).get("enabled")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Reset link" }));
    expect(act.resetInviteLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /yes, reset/i }));
    await waitFor(() => expect(act.resetInviteLink).toHaveBeenCalledTimes(1));
  });

  it("Copy writes the absolute URL to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(await UsersContent({}));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://cloworks.test/join/abc123"));
  });

  it("Invited tab: open invites with expiry, Expired chip, Resend and Revoke; Invite form", async () => {
    render(await UsersContent({ tab: "invited" }));
    expect(screen.getByRole("link", { name: "Invited" }).getAttribute("aria-current")).toBe("page");
    const table = screen.getByRole("table", { name: "Open invites" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Email", "Roles", "Invited by", "Expires", "Manage"]);
    expect(within(table).getByText("new@gmail.com")).toBeTruthy();
    expect(within(table).getAllByText("Expired")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Resend invite to new@gmail.com" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke invite for old@gmail.com" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send invite" })).toBeTruthy();
    expect(prismaMock.invite.findMany.mock.calls[0][0].where).toMatchObject({ acceptedAt: null, revokedAt: null });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("Invited: revoke asks for confirmation, resend submits the invite id", async () => {
    act.resendMemberInvite.mockResolvedValue({ ok: true, message: "Invite sent again.", values: {}, nonce: "a" });
    act.revokeMemberInvite.mockResolvedValue({ ok: true, message: "Invite revoked.", values: {}, nonce: "b" });
    render(await UsersContent({ tab: "invited" }));
    fireEvent.click(screen.getByRole("button", { name: "Resend invite to new@gmail.com" }));
    await waitFor(() => expect(act.resendMemberInvite).toHaveBeenCalledTimes(1));
    expect((act.resendMemberInvite.mock.calls[0][1] as FormData).get("inviteId")).toBe("i1");
    fireEvent.click(screen.getByRole("button", { name: "Revoke invite for old@gmail.com" }));
    expect(act.revokeMemberInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /yes, revoke/i }));
    await waitFor(() => expect(act.revokeMemberInvite).toHaveBeenCalledTimes(1));
    expect((act.revokeMemberInvite.mock.calls[0][1] as FormData).get("inviteId")).toBe("i2");
  });

  it("Requests tab: rows with source, role selects defaulting to Requester / Other", async () => {
    render(await UsersContent({ tab: "requests" }));
    const row = screen.getByRole("listitem", { name: "Andi" });
    expect(within(row).getByText("andi@gmail.com")).toBeTruthy();
    expect(within(row).getByText("Join link")).toBeTruthy();
    expect(within(screen.getByRole("listitem", { name: "Sari" })).getByText("Company email")).toBeTruthy();
    const app = within(row).getByLabelText("App role") as HTMLSelectElement;
    const job = within(row).getByLabelText("Job role") as HTMLSelectElement;
    expect(app.value).toBe("REQUESTER");
    expect(job.value).toBe("OTHER");
    expect(screen.getAllByRole("button", { name: /^Approve / })).toHaveLength(3);
  });

  it("Approve sends the applicant and the chosen roles", async () => {
    act.approveRequest.mockResolvedValue({ ok: true, message: "Approved.", values: {}, nonce: "x" });
    render(await UsersContent({ tab: "requests" }));
    const row = screen.getByRole("listitem", { name: "Andi" });
    fireEvent.change(within(row).getByLabelText("App role"), { target: { value: "CREATIVE" } });
    fireEvent.change(within(row).getByLabelText("Job role"), { target: { value: "DESIGNER" } });
    fireEvent.click(within(row).getByRole("button", { name: "Approve Andi" }));
    await waitFor(() => expect(act.approveRequest).toHaveBeenCalledTimes(1));
    const fd = act.approveRequest.mock.calls[0][1] as FormData;
    expect([fd.get("applicantId"), fd.get("appRole"), fd.get("jobRole")]).toEqual(["p1", "CREATIVE", "DESIGNER"]);
  });

  it("Reject asks for confirmation first", async () => {
    act.rejectRequest.mockResolvedValue({ ok: true, message: "Rejected.", values: {}, nonce: "y" });
    render(await UsersContent({ tab: "requests" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject Andi" }));
    expect(act.rejectRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /yes, reject andi/i }));
    await waitFor(() => expect(act.rejectRequest).toHaveBeenCalledTimes(1));
    expect((act.rejectRequest.mock.calls[0][1] as FormData).get("applicantId")).toBe("p1");
  });

  it("Rejected list is collapsed and offers Undo", async () => {
    act.undoRejectRequest.mockResolvedValue({ ok: true, message: "Back in requests.", values: {}, nonce: "z" });
    const { container } = render(await UsersContent({ tab: "requests" }));
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Rejected (1)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo reject for Rudi" }));
    await waitFor(() => expect(act.undoRejectRequest).toHaveBeenCalledTimes(1));
    expect((act.undoRejectRequest.mock.calls[0][1] as FormData).get("applicantId")).toBe("r1");
  });

  it("empty Requests tab says so", async () => {
    joinAdmin.loadJoinAdmin.mockResolvedValue({ workspace: { joinCode: "abc123", joinLinkEnabled: true, emailDomain: null }, requests: { pending: [], rejected: [] } });
    render(await UsersContent({ tab: "requests" }));
    expect(screen.getByText("No join requests waiting.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Requests" })).toBeTruthy();
  });

  it("an unknown tab falls back to Members", async () => {
    render(await UsersContent({ tab: "nonsense" }));
    expect(within(screen.getByRole("navigation", { name: "Member views" })).getByRole("link", { name: "Members" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "Add person" })).toBeTruthy();
  });

  for (const role of ["REQUESTER", "CREATIVE", "LEAD"]) {
    it(`${role} sees AdminDenied and nothing is loaded`, async () => {
      requireUser.mockResolvedValue({ id: "x", appRole: role, jobRole: "OTHER", workspaceId: "w1" });
      render(await UsersContent({ tab: "requests" }));
      expect(screen.getByRole("alert").textContent).toMatch(/access denied/i);
      expect(joinAdmin.loadJoinAdmin).not.toHaveBeenCalled();
      expect(prismaMock.invite.findMany).not.toHaveBeenCalled();
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });
  }
});
