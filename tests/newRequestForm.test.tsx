// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { act } from "react";

const submit = vi.fn();
vi.mock("@/app/(app)/requests/actions", () => ({ submitRequest: (...a: unknown[]) => submit(...a) }));
vi.mock("../actions", () => ({ submitRequest: (...a: unknown[]) => submit(...a) }));

import { NewRequestForm } from "@/app/(app)/requests/new/NewRequestForm";

const brands = [{ id: "b1", name: "Clogent" }];
const divisions = [{ id: "d1", name: "Creative" }];
const types = [
  { id: "t1", name: "General Design", fieldSchema: [] },
  { id: "t2", name: "Social Media", fieldSchema: [
    { key: "platform", label: "Platform", type: "select" as const, options: ["TikTok", "Instagram"], required: true },
    { key: "shooting", label: "Shooting", type: "checkbox" as const },
  ] },
];

afterEach(cleanup);

describe("NewRequestForm", () => {
  it("keeps typed values and focuses the first invalid field after a failed submit", async () => {
    submit.mockImplementation(async (_prev: unknown, fd: FormData) => ({
      ok: false, message: "bad", nonce: "n1",
      fieldErrors: { briefUrl: "Must be an http(s) link", "fields.platform": "Platform is required" },
      values: {
        title: String(fd.get("title")), briefUrl: String(fd.get("briefUrl")), notes: String(fd.get("notes")),
        brandId: String(fd.get("brandId")), divisionId: String(fd.get("divisionId")), typeId: String(fd.get("typeId")),
        deadline: String(fd.get("deadline")), fields: { shooting: true },
      },
    }));
    render(<NewRequestForm brands={brands} divisions={divisions} types={types} />);
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Poster" } });
    fireEvent.change(screen.getByLabelText("Brief link"), { target: { value: "ftp://x" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "hello" } });
    fireEvent.change(screen.getByLabelText(/^Brand/), { target: { value: "b1" } });
    fireEvent.change(screen.getByLabelText(/^Division/), { target: { value: "d1" } });
    fireEvent.change(screen.getByLabelText(/^Request type/), { target: { value: "t2" } });
    fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2099-01-01" } });
    fireEvent.click(await screen.findByLabelText("Shooting"));

    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /submit/i }).closest("form")!); });

    await waitFor(() => expect(screen.getByText("Must be an http(s) link")).toBeTruthy());
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Poster");
    expect((screen.getByLabelText("Brief link") as HTMLInputElement).value).toBe("ftp://x");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("hello");
    expect((screen.getByLabelText(/^Brand/) as HTMLSelectElement).value).toBe("b1");
    expect((screen.getByLabelText(/^Division/) as HTMLSelectElement).value).toBe("d1");
    expect((screen.getByLabelText(/^Request type/) as HTMLSelectElement).value).toBe("t2");
    expect((screen.getByLabelText("Deadline") as HTMLInputElement).value).toBe("2099-01-01");
    expect((screen.getByLabelText("Shooting") as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Brief link"));
  });

  it("shows banner for errors with no rendered field", async () => {
    submit.mockResolvedValue({ ok: false, message: "m", nonce: "n2", fieldErrors: { form: "Something global" }, values: { title: "", briefUrl: "", notes: "", brandId: "", divisionId: "", typeId: "", deadline: "", fields: {} } });
    render(<NewRequestForm brands={brands} divisions={divisions} types={types} />);
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: /submit/i }).closest("form")!); });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Something global"));
  });
});
