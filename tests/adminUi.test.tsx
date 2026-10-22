// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const act = {
  saveLoginEmail: vi.fn(), savePassword: vi.fn(), setUserActive: vi.fn(), saveRequestType: vi.fn(),
  saveUser: vi.fn(), addPerson: vi.fn(), saveBrand: vi.fn(), saveDivision: vi.fn(), saveDivisionCalendar: vi.fn(),
};
vi.mock("@/app/(app)/admin/users/actions", () => ({
  inviteMember: vi.fn(), resendMemberInvite: vi.fn(), revokeMemberInvite: vi.fn(), approveRequest: vi.fn(), rejectRequest: vi.fn(), undoRejectRequest: vi.fn(), resetInviteLink: vi.fn(), toggleInviteLink: vi.fn(), previewMerge: vi.fn(), mergePerson: vi.fn(), saveLoginEmail: (...a: unknown[]) => act.saveLoginEmail(...a),
  savePassword: (...a: unknown[]) => act.savePassword(...a),
  setUserActive: (...a: unknown[]) => act.setUserActive(...a),
  saveUser: (...a: unknown[]) => act.saveUser(...a),
  addPerson: (...a: unknown[]) => act.addPerson(...a),
}));
vi.mock("@/app/(app)/admin/lists/actions", () => ({
  saveRequestType: (...a: unknown[]) => act.saveRequestType(...a),
  saveBrand: (...a: unknown[]) => act.saveBrand(...a),
  saveDivision: (...a: unknown[]) => act.saveDivision(...a),
  saveDivisionCalendar: (...a: unknown[]) => act.saveDivisionCalendar(...a),
}));

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

import { ActiveToggle, AddPersonForm, LoginEmailForm, PasswordForm } from "@/app/(app)/admin/users/UserForms";
import { DivisionCalendarForm, TypeForm } from "@/app/(app)/admin/lists/ListForms";
import { UsersContent } from "@/app/(app)/admin/users/UsersContent";
import { ListsContent } from "@/app/(app)/admin/lists/ListsContent";
import { CalendarContent } from "@/app/(app)/admin/calendar/CalendarContent";

const u = { id: "u1", name: "Rina", fullName: "Rina Putri", title: null, appRole: "CREATIVE", jobRole: "DESIGNER", aliases: [], email: null, active: true, hasPassword: false };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("admin forms", () => {
  it("add person offers an optional login email and temporary password", () => {
    render(<AddPersonForm />);
    const email = screen.getByLabelText(/^login email/i) as HTMLInputElement;
    const pw = screen.getByLabelText(/^temporary password/i) as HTMLInputElement;
    expect(email.name).toBe("email");
    expect(email.required).toBe(false);
    expect(pw.name).toBe("password");
    expect(pw.type).toBe("password");
    expect(pw.required).toBe(false);
  });

  it("login email keeps typed input and flags the field after a failed save", async () => {
    act.saveLoginEmail.mockImplementation(async (_p: unknown, fd: FormData) => ({
      ok: false, code: "CONFLICT", message: "x@gmail.com is already the login email of Dina", nonce: "n1", values: { email: String(fd.get("email")), userId: "u1" },
    }));
    render(<LoginEmailForm u={u} />);
    fireEvent.change(screen.getByLabelText(/^login email/i), { target: { value: "x@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: /save login email/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^Error: .*Dina/);
    const input = screen.getByLabelText(/^login email/i) as HTMLInputElement;
    expect(input.value).toBe("x@gmail.com");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("password form: needs a login email first; a failed save shows the error and does not echo the password", async () => {
    const { unmount } = render(<PasswordForm u={u} />);
    expect(screen.getByText(/set a login email first/i)).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    unmount();

    act.savePassword.mockImplementation(async () => ({
      ok: false, code: "VALIDATION", message: "Password must be at least 10 characters.", nonce: "p1", values: { userId: "u1", password: "" },
    }));
    render(<PasswordForm u={{ ...u, email: "rina@clogent.co.id" }} />);
    const input = screen.getByLabelText(/^password/i) as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "short-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password for Rina" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/at least 10/);
    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).value).toBe("");
  });

  it("deactivate needs an explicit confirmation step", async () => {
    act.setUserActive.mockResolvedValue({ ok: true, message: "Deactivated. History is kept.", values: {}, nonce: "n2" });
    render(<ActiveToggle u={u} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Rina" }));
    expect(act.setUserActive).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: /confirm/i })).toBeTruthy();
    // cancel leaves nothing submitted
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(act.setUserActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Rina" }));
    fireEvent.click(screen.getByRole("button", { name: /yes, deactivate rina/i }));
    await waitFor(() => expect(act.setUserActive).toHaveBeenCalledTimes(1));
    const fd = act.setUserActive.mock.calls[0][1] as FormData;
    expect(fd.get("userId")).toBe("u1");
    expect(fd.get("active")).toBe("false");
    expect((await screen.findByRole("status")).textContent).toMatch(/deactivated/i);
  });

  it("a failed confirmed action is reported as text", async () => {
    act.setUserActive.mockResolvedValue({ ok: false, message: "nope", values: {}, nonce: "n3" });
    render(<ActiveToggle u={u} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Rina" }));
    fireEvent.click(screen.getByRole("button", { name: /yes, deactivate rina/i }));
    await waitFor(() => expect(act.setUserActive).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole("alert")).textContent).toBe("Error: nope");
  });

  it("request type form keeps the typed JSON and lists every schema problem", async () => {
    act.saveRequestType.mockImplementation(async (_p: unknown, fd: FormData) => ({
      ok: false, code: "VALIDATION", message: "Field schema is invalid: Field 1: Required", details: ["Field 1: Required", "Field 2: key is used twice"],
      nonce: "n4", values: { name: String(fd.get("name")), fieldSchema: String(fd.get("fieldSchema")) },
    }));
    render(<TypeForm />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Video" } });
    fireEvent.change(screen.getByLabelText(/field schema/i), { target: { value: '[{"bad":1}]' } });
    fireEvent.click(screen.getByRole("button", { name: /add request type/i }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Video");
    expect((screen.getByLabelText(/field schema/i) as HTMLTextAreaElement).value).toBe('[{"bad":1}]');
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Field 1: Required", "Field 2: key is used twice"]);
  });
});

describe("request type form Active checkbox", () => {
  it("posts active=on while ticked (new types start active) and nothing when unticked", async () => {
    act.saveRequestType.mockResolvedValue({ ok: true, message: "ok", values: {}, nonce: "a1" });
    render(<TypeForm />);
    expect(screen.getByRole("checkbox", { name: /^Active/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /add request type/i }));
    await waitFor(() => expect(act.saveRequestType).toHaveBeenCalledTimes(1));
    expect((act.saveRequestType.mock.calls[0][1] as FormData).get("active")).toBe("on");
    // The form remounts (key = nonce) once the save resolves; its success status is rendered inside the new form, so
    // wait for it before touching the box, or the click can land on the old, unmounting checkbox.
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "ok");
    await waitFor(() => expect(screen.getByRole("button", { name: /add request type/i }).getAttribute("aria-busy")).not.toBe("true"));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Active/ }));
    expect(screen.getByRole("checkbox", { name: /^Active/ }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /add request type/i }));
    await waitFor(() => expect(act.saveRequestType).toHaveBeenCalledTimes(2));
    expect((act.saveRequestType.mock.calls[1][1] as FormData).get("active")).toBeNull();
  });
});

describe("admin pages gate", () => {
  for (const role of ["REQUESTER", "CREATIVE", "LEAD"]) {
    it(`${role} sees access denied and no query runs`, async () => {
      requireUser.mockResolvedValue({ id: "x", appRole: role, jobRole: "OTHER" });
      for (const C of [UsersContent, ListsContent, CalendarContent]) {
        const { container, unmount } = render(await C());
        expect(screen.getByRole("alert").textContent).toMatch(/access denied/i);
        expect(container.textContent).not.toMatch(/@/);
        unmount();
      }
      for (const m of [prismaMock.user, prismaMock.brand, prismaMock.division, prismaMock.requestType])
        expect(m.findMany).not.toHaveBeenCalled();
    });
  }

  it("admin sees the data", async () => {
    requireUser.mockResolvedValue({ id: "a", appRole: "ADMIN", jobRole: "OTHER" });
    prismaMock.user.findMany.mockResolvedValue([{ ...u, email: "rina@gmail.com", department: null }]);
    render(await UsersContent());
    expect(screen.getByRole("columnheader", { name: "Login email" })).toBeTruthy();
    expect(screen.getByText("rina@gmail.com")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Allowed emails" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Add person" })).toBeNull(); // moved to its own page
  });

  it("shows the Waitlist tab to a platform admin only", async () => {
    requireUser.mockResolvedValue({ id: "a", appRole: "ADMIN", jobRole: "OTHER" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.brand.findMany.mockResolvedValue([]);
    prismaMock.division.findMany.mockResolvedValue([]);
    prismaMock.requestType.findMany.mockResolvedValue([]);
    process.env.PLATFORM_ADMIN_EMAILS = "boss@clogent.co.id";
    try {
      for (const C of [UsersContent, ListsContent, CalendarContent]) {
        prismaMock.user.findUnique.mockResolvedValueOnce({ email: "boss@clogent.co.id" });
        const { unmount } = render(await C());
        expect(screen.getByRole("link", { name: "Waitlist" }).getAttribute("href")).toBe("/admin/waitlist");
        unmount();
        prismaMock.user.findUnique.mockResolvedValueOnce({ email: "someone@else.co" });
        const again = render(await C());
        expect(screen.queryByRole("link", { name: "Waitlist" })).toBeNull();
        again.unmount();
      }
    } finally {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    }
  });

  it("shows whether a password is set but never loads or renders the hash", async () => {
    requireUser.mockResolvedValue({ id: "a", appRole: "ADMIN", jobRole: "OTHER" });
    prismaMock.user.findMany.mockResolvedValue([
      { ...u, email: "rina@clogent.co.id", passwordHash: "scrypt$32768$8$1$c2FsdA==$TOPSECRETHASH" },
      { ...u, id: "u2", name: "Budi", email: "budi@clogent.co.id", passwordHash: null },
    ]);
    const { container } = render(await UsersContent());
    // Open both edit panels so their forms are in the page too.
    for (const name of ["Rina", "Budi"]) fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
    expect(container.innerHTML).not.toContain("TOPSECRETHASH");
    expect(screen.getByText("Password set")).toBeTruthy();
    expect(screen.getByText("No password yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set password for Rina" }).textContent).toBe("Reset password");
  });
});

describe("division calendar settings form", () => {
  const members = [{ id: "m1", name: "Fafa" }, { id: "m2", name: "Rifqy" }];
  const division = { id: "d1", name: "KOL", color: "div-3", onMarketingCalendar: true, sortOrder: 3, leadIds: ["m2"] };

  it("shows colour, the calendar switch, order and the leads", () => {
    render(<DivisionCalendarForm division={division} members={members} />);
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Blue", "Coral", "Green", "Amber", "Pink", "Violet", "Teal", "Slate"]);
    expect(screen.getByRole("radio", { name: "Green" }).getAttribute("aria-checked")).toBe("true");
    for (const r of screen.getAllByRole("radio")) expect(r.className).not.toMatch(/white|\(--/); // tokens only (AGENTS.md)
    expect(screen.getByRole("switch", { name: "On the calendar" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Order") as HTMLInputElement).value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "Leads of KOL: Rifqy" }));
    expect(screen.getByRole("checkbox", { name: "Rifqy" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "Fafa" }).getAttribute("aria-checked")).toBe("false");
  });

  it("posts the settings with every ticked lead", async () => {
    act.saveDivisionCalendar.mockResolvedValue({ ok: true, message: "Division calendar settings saved.", values: {}, nonce: "n" });
    render(<DivisionCalendarForm division={division} members={members} />);
    fireEvent.click(screen.getByRole("button", { name: "Leads of KOL: Rifqy" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Fafa" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pink" }));
    fireEvent.click(screen.getByRole("button", { name: "Save calendar settings for KOL" }));
    await screen.findByText("Division calendar settings saved.");
    const fd = act.saveDivisionCalendar.mock.calls[0][1] as FormData;
    expect(fd.get("id")).toBe("d1");
    expect(fd.get("color")).toBe("div-5");
    expect(fd.get("onMarketingCalendar")).toBe("on");
    expect(fd.get("sortOrder")).toBe("3");
    expect(fd.getAll("leadIds").sort()).toEqual(["m1", "m2"]);
  });

  it("keeps the current leads when saving without opening the leads list", async () => {
    act.saveDivisionCalendar.mockResolvedValue({ ok: true, message: "Division calendar settings saved.", values: {}, nonce: "n" });
    render(<DivisionCalendarForm division={{ ...division, leadIds: ["m1", "m2"] }} members={members} />);
    expect(screen.getByRole("button", { name: "Leads of KOL: Fafa, Rifqy" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("radio", { name: "Teal" }));
    fireEvent.click(screen.getByRole("button", { name: "Save calendar settings for KOL" }));
    await screen.findByText("Division calendar settings saved.");
    const fd = act.saveDivisionCalendar.mock.calls[0][1] as FormData;
    expect(fd.get("color")).toBe("div-7");
    expect(fd.getAll("leadIds").sort()).toEqual(["m1", "m2"]);
  });

  it("shows No leads when nobody leads the division", () => {
    render(<DivisionCalendarForm division={{ ...division, leadIds: [] }} members={members} />);
    expect(screen.getByRole("button", { name: "Leads of KOL: No leads" })).toBeTruthy();
  });
});
