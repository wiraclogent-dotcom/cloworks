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
const values = { title: "Poster", briefUrl: "", notes: "", brandId: "b1", divisionId: "", deadline: "", workKind: "motion" as const };

beforeEach(() => submit.mockReset());
afterEach(cleanup);

describe("New request form layout", () => {
  it("reads as four numbered steps, with the help card beside them", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "1What do you need?", "2Which brand & team?", "3Describe it", "4When do you need it?", "What happens next",
    ]);
    const help = screen.getByRole("complementary", { name: "What happens next" });
    expect(within(help).getAllByRole("listitem")).toHaveLength(3);
    expect(help.textContent).toContain("Follow progress on the board");
    expect(help.textContent).toMatch(/email only/i);
    expect(help.querySelector("form")).toBeNull();
  });

  it("kind cards: named by title, described by an example line", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    const video = screen.getByRole("radio", { name: "Video edit only" }) as HTMLInputElement;
    expect(document.getElementById(video.getAttribute("aria-describedby")!)!.textContent).toBe("Cut, edit or subtitle existing footage");
    const stat = screen.getByRole("radio", { name: "Static design" }) as HTMLInputElement;
    expect(document.getElementById(stat.getAttribute("aria-describedby")!)!.textContent).toBe("Feed post, banner, packaging, PDP image");
  });

  it("primary Create request button and a Cancel link back to the requests", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    const btn = screen.getByRole("button", { name: "Create request" });
    expect(btn.getAttribute("type")).toBe("submit");
    expect(btn.className).toMatch(/bg-primary/);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/requests");
  });

  it("after a failed submit: inline error with icon, kit invalid style, and the picked card restored", async () => {
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
    expect((screen.getByRole("radio", { name: "Design + motion" }) as HTMLInputElement).checked).toBe(true);
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
