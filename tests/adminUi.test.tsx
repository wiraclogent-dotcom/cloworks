// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const act = {
  saveLoginEmail: vi.fn(), setUserActive: vi.fn(), removeAllowed: vi.fn(), saveRequestType: vi.fn(),
  saveUser: vi.fn(), addPerson: vi.fn(), addAllowed: vi.fn(), saveBrand: vi.fn(), saveDivision: vi.fn(),
};
vi.mock("@/app/(app)/admin/users/actions", () => ({
  saveLoginEmail: (...a: unknown[]) => act.saveLoginEmail(...a),
  setUserActive: (...a: unknown[]) => act.setUserActive(...a),
  removeAllowed: (...a: unknown[]) => act.removeAllowed(...a),
  saveUser: (...a: unknown[]) => act.saveUser(...a),
  addPerson: (...a: unknown[]) => act.addPerson(...a),
  addAllowed: (...a: unknown[]) => act.addAllowed(...a),
}));
vi.mock("@/app/(app)/admin/lists/actions", () => ({
  saveRequestType: (...a: unknown[]) => act.saveRequestType(...a),
  saveBrand: (...a: unknown[]) => act.saveBrand(...a),
  saveDivision: (...a: unknown[]) => act.saveDivision(...a),
}));

const requireUser = vi.fn();
vi.mock("@/lib/session", () => ({ requireUser: () => requireUser() }));
const prismaMock = vi.hoisted(() => ({
  user: { findMany: vi.fn() }, allowedEmail: { findMany: vi.fn() },
  brand: { findMany: vi.fn() }, division: { findMany: vi.fn() }, requestType: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { ActiveToggle, LoginEmailForm, RemoveAllowed } from "@/app/(app)/admin/users/UserForms";
import { TypeForm } from "@/app/(app)/admin/lists/ListForms";
import { UsersContent } from "@/app/(app)/admin/users/UsersContent";
import { ListsContent } from "@/app/(app)/admin/lists/ListsContent";

const u = { id: "u1", name: "Rina", fullName: "Rina Putri", title: null, appRole: "CREATIVE", jobRole: "DESIGNER", aliases: [], email: null, active: true };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("admin forms", () => {
  it("login email keeps typed input and flags the field after a failed save", async () => {
    act.saveLoginEmail.mockImplementation(async (_p: unknown, fd: FormData) => ({
      ok: false, code: "CONFLICT", message: "x@gmail.com is already the login email of Dina", nonce: "n1", values: { email: String(fd.get("email")), userId: "u1" },
    }));
    render(<LoginEmailForm u={u} />);
    fireEvent.change(screen.getByLabelText(/login email/i), { target: { value: "x@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: /save login email/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^Error: .*Dina/);
    const input = screen.getByLabelText(/login email/i) as HTMLInputElement;
    expect(input.value).toBe("x@gmail.com");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("deactivate needs an explicit confirmation step", async () => {
    act.setUserActive.mockResolvedValue({ ok: true, message: "Deactivated. History is kept.", values: {}, nonce: "n2" });
    render(<ActiveToggle u={u} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(act.setUserActive).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: /confirm/i })).toBeTruthy();
    // cancel leaves nothing submitted
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(act.setUserActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    fireEvent.click(screen.getByRole("button", { name: /yes, deactivate rina/i }));
    await waitFor(() => expect(act.setUserActive).toHaveBeenCalledTimes(1));
    const fd = act.setUserActive.mock.calls[0][1] as FormData;
    expect(fd.get("userId")).toBe("u1");
    expect(fd.get("active")).toBe("false");
    expect((await screen.findByRole("status")).textContent).toMatch(/deactivated/i);
  });

  it("removing an allowed email needs confirmation; a failure is reported as text", async () => {
    act.removeAllowed.mockResolvedValue({ ok: false, message: "nope", values: {}, nonce: "n3" });
    render(<RemoveAllowed email="a@gmail.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(act.removeAllowed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /yes, remove a@gmail.com/i }));
    await waitFor(() => expect(act.removeAllowed).toHaveBeenCalledTimes(1));
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

describe("admin pages gate", () => {
  for (const role of ["REQUESTER", "CREATIVE", "LEAD"]) {
    it(`${role} sees access denied and no query runs`, async () => {
      requireUser.mockResolvedValue({ id: "x", appRole: role, jobRole: "OTHER" });
      for (const C of [UsersContent, ListsContent]) {
        const { container, unmount } = render(await C());
        expect(screen.getByRole("alert").textContent).toMatch(/access denied/i);
        expect(container.textContent).not.toMatch(/@/);
        unmount();
      }
      for (const m of [prismaMock.user, prismaMock.allowedEmail, prismaMock.brand, prismaMock.division, prismaMock.requestType])
        expect(m.findMany).not.toHaveBeenCalled();
    });
  }

  it("admin sees the data", async () => {
    requireUser.mockResolvedValue({ id: "a", appRole: "ADMIN", jobRole: "OTHER" });
    prismaMock.user.findMany.mockResolvedValue([{ ...u, email: "rina@gmail.com", department: null }]);
    prismaMock.allowedEmail.findMany.mockResolvedValue([{ id: "e1", email: "rina@gmail.com", note: "login for Rina" }]);
    render(await UsersContent());
    expect(screen.getByRole("columnheader", { name: "Login email" })).toBeTruthy();
    expect(screen.getByText("Used by Rina · login for Rina")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Allowed emails" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Add person" })).toBeTruthy();
  });
});
