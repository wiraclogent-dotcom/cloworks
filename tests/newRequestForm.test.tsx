// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { act } from "react";

const submit = vi.fn();
vi.mock("@/app/(app)/requests/actions", () => ({ submitRequest: (...a: unknown[]) => submit(...a) }));
vi.mock("../actions", () => ({ submitRequest: (...a: unknown[]) => submit(...a) }));

import { NewRequestForm } from "@/app/(app)/requests/new/NewRequestForm";

const brands = [{ id: "b1", name: "Clogent" }];
const divisions = [{ id: "d1", name: "Creative" }];
const emptyValues = { title: "", briefUrl: "", notes: "", brandId: "", divisionId: "", deadline: "", workKind: "" };

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

  it("starts with a required 'What do you need?' choice of three cards, none picked", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    const group = screen.getByRole("group", { name: /What do you need\?/ });
    expect(group.tagName).toBe("FIELDSET");
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => [r.name, r.value])).toEqual([["workKind", "static"], ["workKind", "motion"], ["workKind", "video"]]);
    expect(radios.map((r) => r.labels?.[0]?.textContent)).toEqual([
      expect.stringContaining("Static design"), expect.stringContaining("Design + motion"), expect.stringContaining("Video edit only"),
    ]);
    expect(radios.some((r) => r.checked)).toBe(false);
    // It comes before every other field.
    const first = document.querySelector("form input, form select, form textarea") as HTMLInputElement;
    expect(first.name).toBe("workKind");
  });

  it("hints follow the picked kind", () => {
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    fireEvent.click(screen.getByRole("radio", { name: /Video edit only/ }));
    expect(screen.getByText("Drive folder with the raw footage")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "What happens next" }).textContent).toContain("A lead assigns a video editor");
    fireEvent.click(screen.getByRole("radio", { name: /Static design/ }));
    expect(screen.getByText("Google Doc or Drive folder with the copy and references")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "What happens next" }).textContent).toContain("A lead assigns a designer");
  });

  it("deadline quick picks fill the date in Jakarta time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T20:00:00Z")); // 11 Oct 03:00 in Jakarta
    try {
      render(<NewRequestForm brands={brands} divisions={divisions} />);
      const date = screen.getByLabelText("Deadline") as HTMLInputElement;
      fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
      expect(date.value).toBe("2026-10-12");
      fireEvent.click(screen.getByRole("button", { name: "In 3 days" }));
      expect(date.value).toBe("2026-10-14");
      fireEvent.click(screen.getByRole("button", { name: "Next week" }));
      expect(date.value).toBe("2026-10-18");
    } finally { vi.useRealTimers(); }
  });

  it("keeps typed values, the motion choice, and focuses the first invalid field after a failed submit", async () => {
    submit.mockImplementation(async (_prev: unknown, fd: FormData) => ({
      ok: false, message: "bad", nonce: "n1",
      fieldErrors: { briefUrl: "Must be an http(s) link" },
      values: {
        title: String(fd.get("title")), briefUrl: String(fd.get("briefUrl")), notes: String(fd.get("notes")),
        brandId: String(fd.get("brandId")), divisionId: String(fd.get("divisionId")),
        deadline: String(fd.get("deadline")), workKind: String(fd.get("workKind") ?? ""),
      },
    }));
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Poster" } });
    fireEvent.change(screen.getByLabelText("Brief link"), { target: { value: "ftp://x" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "hello" } });
    fireEvent.change(screen.getByLabelText(/^Brand/), { target: { value: "b1" } });
    fireEvent.change(screen.getByLabelText(/^Division/), { target: { value: "d1" } });
    fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2099-01-01" } });
    fireEvent.click(screen.getByRole("radio", { name: /Design \+ motion/ }));

    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /create request/i }).closest("form")!); });

    await waitFor(() => expect(screen.getByText("Must be an http(s) link")).toBeTruthy());
    const sent = submit.mock.calls[0][1] as FormData;
    expect(sent.get("workKind")).toBe("motion");
    expect(sent.has("typeId")).toBe(false);
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Poster");
    expect((screen.getByLabelText("Brief link") as HTMLInputElement).value).toBe("ftp://x");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("hello");
    expect((screen.getByLabelText(/^Brand/) as HTMLSelectElement).value).toBe("b1");
    expect((screen.getByLabelText(/^Division/) as HTMLSelectElement).value).toBe("d1");
    expect((screen.getByLabelText("Deadline") as HTMLInputElement).value).toBe("2099-01-01");
    expect((screen.getByRole("radio", { name: /Design \+ motion/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /Static design/ }) as HTMLInputElement).checked).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Brief link"));
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("1 problem: Brief link: Must be an http(s) link");
  });

  it("a missing choice shows its error on the cards and focuses the first one", async () => {
    submit.mockResolvedValue({ ok: false, message: "Pick what you need", nonce: "n3", fieldErrors: { workKind: "Pick what you need" }, values: emptyValues });
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /create request/i }).closest("form")!); });
    expect((submit.mock.calls[0][1] as FormData).get("workKind")).toBeNull();
    await waitFor(() => expect(document.getElementById("workKind-error")!.textContent).toContain("Pick what you need"));
    const group = screen.getByRole("group", { name: /What do you need\?/ });
    expect(group.getAttribute("aria-describedby")).toContain("workKind-error");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /Static design/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows banner for errors with no rendered field (e.g. the missing default type)", async () => {
    submit.mockResolvedValue({ ok: false, message: "m", nonce: "n2", fieldErrors: { form: "The default request type 'General Design' is missing" }, values: emptyValues });
    render(<NewRequestForm brands={brands} divisions={divisions} />);
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /create request/i }).closest("form")!); });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("default request type"));
  });
});
