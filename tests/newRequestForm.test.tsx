// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { act } from "react";

const submit = vi.fn();
vi.mock("@/app/(app)/requests/actions", () => ({ submitRequest: (...a: unknown[]) => submit(...a) }));
vi.mock("../actions", () => ({ submitRequest: (...a: unknown[]) => submit(...a) }));

import { NewRequestForm } from "@/app/(app)/requests/new/NewRequestForm";

const brands = [{ id: "b1", name: "Clogent" }];
const divisions = [{ id: "d1", name: "Creative" }];
const emptyValues = { title: "", briefUrl: "", notes: "", brandId: "", divisionId: "", deadline: "", needsMotion: false };

beforeEach(() => { submit.mockReset(); });
afterEach(cleanup);

describe("NewRequestForm", () => {
  it("has no request type control or type-specific detail fields", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    expect(screen.queryByLabelText(/Request type/)).toBeNull();
    expect(document.querySelector('[name="typeId"]')).toBeNull();
    expect(document.querySelector('[name^="f_"]')).toBeNull();
    for (const t of ["Platform", "Content type", "Shooting", "Editing", "Upload", "Published link"]) expect(screen.queryByLabelText(new RegExp(t, "i"))).toBeNull();
  });

  it("offers a 'Does this task need motion?' radio group with No selected by default and the helper text", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    const group = screen.getByRole("group", { name: "Does this task need motion?" });
    expect(group.tagName).toBe("FIELDSET");
    const no = screen.getByLabelText("No") as HTMLInputElement;
    const yes = screen.getByLabelText("Yes, needs motion") as HTMLInputElement;
    expect([no.type, yes.type]).toEqual(["radio", "radio"]);
    expect([no.name, yes.name]).toEqual(["needsMotion", "needsMotion"]);
    expect(no.checked).toBe(true);
    expect(yes.checked).toBe(false);
    expect(group.textContent).toContain("Motion work is done by the motion/video editor. Marking it lets us count both the design effort and the motion effort later.");
    expect(group.contains(no) && group.contains(yes)).toBe(true);
  });

  it("keeps typed values, the motion choice, and focuses the first invalid field after a failed submit", async () => {
    submit.mockImplementation(async (_prev: unknown, fd: FormData) => ({
      ok: false, message: "bad", nonce: "n1",
      fieldErrors: { briefUrl: "Must be an http(s) link" },
      values: {
        title: String(fd.get("title")), briefUrl: String(fd.get("briefUrl")), notes: String(fd.get("notes")),
        brandId: String(fd.get("brandId")), divisionId: String(fd.get("divisionId")),
        deadline: String(fd.get("deadline")), needsMotion: fd.get("needsMotion") === "yes",
      },
    }));
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Poster" } });
    fireEvent.change(screen.getByLabelText("Brief link"), { target: { value: "ftp://x" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "hello" } });
    fireEvent.change(screen.getByLabelText(/^Brand/), { target: { value: "b1" } });
    fireEvent.change(screen.getByLabelText(/^Division/), { target: { value: "d1" } });
    fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2099-01-01" } });
    fireEvent.click(screen.getByLabelText("Yes, needs motion"));

    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /submit/i }).closest("form")!); });

    await waitFor(() => expect(screen.getByText("Must be an http(s) link")).toBeTruthy());
    const sent = submit.mock.calls[0][1] as FormData;
    expect(sent.get("needsMotion")).toBe("yes");
    expect(sent.has("typeId")).toBe(false);
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Poster");
    expect((screen.getByLabelText("Brief link") as HTMLInputElement).value).toBe("ftp://x");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("hello");
    expect((screen.getByLabelText(/^Brand/) as HTMLSelectElement).value).toBe("b1");
    expect((screen.getByLabelText(/^Division/) as HTMLSelectElement).value).toBe("d1");
    expect((screen.getByLabelText("Deadline") as HTMLInputElement).value).toBe("2099-01-01");
    expect((screen.getByLabelText("Yes, needs motion") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("No") as HTMLInputElement).checked).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Brief link"));
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("1 problem: Brief link: Must be an http(s) link");
  });

  it("a plain submit sends needsMotion=no", async () => {
    submit.mockResolvedValue({ ok: false, message: "m", nonce: "n3", fieldErrors: { form: "x" }, values: emptyValues });
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /submit/i }).closest("form")!); });
    expect((submit.mock.calls[0][1] as FormData).get("needsMotion")).toBe("no");
  });

  it("shows banner for errors with no rendered field (e.g. the missing default type)", async () => {
    submit.mockResolvedValue({ ok: false, message: "m", nonce: "n2", fieldErrors: { form: "The default request type 'General Design' is missing" }, values: emptyValues });
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /submit/i }).closest("form")!); });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("default request type"));
  });
});
