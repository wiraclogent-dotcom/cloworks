// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { act } from "react";

const submit = vi.fn();
vi.mock("@/app/(app)/requests/actions", () => ({ submitRequest: (...a: unknown[]) => submit(...a) }));

import { NewRequestForm } from "@/app/(app)/requests/new/NewRequestForm";
import { RadioCards } from "@/components/ui/RadioCards";

const brands = [{ id: "b1", name: "Clogent" }];
const divisions = [{ id: "d1", name: "Creative" }];
const values = { title: "Poster", briefUrl: "", notes: "", brandId: "b1", divisionId: "", deadline: "", needsMotion: true };

beforeEach(() => submit.mockReset());
afterEach(cleanup);

describe("New request form layout", () => {
  it("groups the fields in 'Request details' and 'Motion' cards with the help card beside them", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Request details", "Motion", "What happens next"]);
    const help = screen.getByRole("complementary", { name: "What happens next" });
    expect(within(help).getAllByRole("listitem")).toHaveLength(3);
    expect(help.textContent).toContain("A lead assigns a designer");
    expect(help.textContent).toContain("Follow progress on the board");
    expect(help.textContent).toMatch(/email only/i);
    expect(help.querySelector("form")).toBeNull();
  });

  it("radio cards: named by title, described by their short text, No checked by default", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    const no = screen.getByRole("radio", { name: "No" }) as HTMLInputElement;
    const yes = screen.getByRole("radio", { name: "Yes, needs motion" }) as HTMLInputElement;
    expect(no.checked).toBe(true);
    expect(yes.checked).toBe(false);
    expect([no.value, yes.value]).toEqual(["no", "yes"]);
    expect(document.getElementById(no.getAttribute("aria-describedby")!)!.textContent).toBe("Design only");
    expect(document.getElementById(yes.getAttribute("aria-describedby")!)!.textContent).toBe("A motion/video editor will also work on this");
    const group = screen.getByRole("group", { name: "Does this task need motion?" });
    expect(group.getAttribute("aria-describedby")).toBe("needsMotion-help");
    expect(document.getElementById("needsMotion-help")!.textContent).toMatch(/^Motion work is done/);
  });

  it("primary Create request button and a Cancel link back to the requests", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    const btn = screen.getByRole("button", { name: "Create request" });
    expect(btn.getAttribute("type")).toBe("submit");
    expect(btn.className).toMatch(/bg-primary/);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/requests");
  });

  it("after a failed submit: inline error with icon, kit invalid style, and the Yes card restored", async () => {
    submit.mockResolvedValue({ ok: false, message: "bad", nonce: "x1", fieldErrors: { divisionId: "Choose a division" }, values });
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /create request/i }).closest("form")!); });
    await waitFor(() => expect(screen.getByText("Choose a division")).toBeTruthy());
    const sel = screen.getByLabelText(/^Division/);
    expect(sel.getAttribute("aria-invalid")).toBe("true");
    expect(sel.className).toMatch(/border-danger/);
    const err = document.getElementById("divisionId-error")!;
    expect(sel.getAttribute("aria-describedby")).toBe("divisionId-error");
    expect(err.querySelector("svg[aria-hidden]")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Yes, needs motion" }) as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(sel);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("form-level errors use the danger Alert banner", async () => {
    submit.mockResolvedValue({ ok: false, message: "Something went wrong", nonce: "x2", values });
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /create request/i }).closest("form")!); });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Something went wrong");
    expect(alert.getAttribute("data-tone")).toBe("cancelled");
  });
});

describe("RadioCards hint", () => {
  it("renders the hint inside the fieldset and merges it with describedBy", () => {
    render(<RadioCards name="m" legend="Pick" describedBy="extra" hint="Some help" options={[{ value: "a", title: "A" }]} />);
    const group = screen.getByRole("group", { name: "Pick" });
    expect(group.getAttribute("aria-describedby")).toBe("extra m-help");
    expect(within(group).getByText("Some help").id).toBe("m-help");
    expect(screen.getByRole("radio", { name: "A" }).hasAttribute("aria-describedby")).toBe(false);
  });
});
