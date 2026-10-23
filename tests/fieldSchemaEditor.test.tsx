// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { FieldSchemaEditor } from "@/components/admin/FieldSchemaEditor";
import { rowsFromSchema } from "@/lib/fieldSchemaEdit";
import type { FieldSchema } from "@/lib/fieldSchema";

const SOCIAL: FieldSchema = [
  { key: "platform", type: "select", label: "Platform", options: ["TikTok", "Instagram"], required: true },
  { key: "contentType", type: "select", label: "Content type", options: ["Campaign", "Daily", "Story", "Urgent"], required: true },
  { key: "shooting", type: "checkbox", label: "Shooting" },
  { key: "editing", type: "checkbox", label: "Editing" },
  { key: "upload", type: "checkbox", label: "Upload" },
  { key: "publishedUrl", type: "url", label: "Published link" },
];

class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

const view = (requestsCount = 0, showErrors = false) =>
  render(<form data-testid="f"><FieldSchemaEditor rows={rowsFromSchema(SOCIAL)} requestsCount={requestsCount} showErrors={showErrors} /></form>);
const posted = () => new FormData(screen.getByTestId("f") as HTMLFormElement);
const schema = () => JSON.parse(String(posted().get("fieldSchema")));
const label = (n: number) => screen.getByRole("textbox", { name: `Label of field ${n}` }) as HTMLInputElement;

describe("FieldSchemaEditor", () => {
  it("shows Social Media's fields with plain type names and posts the same schema", () => {
    view();
    expect([1, 2, 3, 4, 5, 6].map((n) => label(n).value)).toEqual(["Platform", "Content type", "Shooting", "Editing", "Upload", "Published link"]);
    expect((screen.getByRole("combobox", { name: "Type of field 1" }) as HTMLSelectElement).selectedOptions[0].textContent).toBe("Choice list");
    expect((screen.getByRole("combobox", { name: "Type of field 6" }) as HTMLSelectElement).selectedOptions[0].textContent).toBe("Link");
    expect(schema()).toEqual(SOCIAL);
    expect(posted().get("fieldSchemaInvalid")).toBeNull();
  });

  it("renaming a label keeps the field's key", () => {
    view();
    fireEvent.change(label(2), { target: { value: "Kind of content" } });
    expect(schema()[1]).toMatchObject({ key: "contentType", label: "Kind of content" });
  });

  it("a duplicate label or an empty Choice list marks the row and posts no schema", () => {
    view(0, true);
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    fireEvent.change(label(7), { target: { value: "content TYPE" } });
    expect(screen.getByText("Another field already uses this label")).toBeTruthy();
    expect(posted().get("fieldSchema")).toBeNull();
    expect(posted().get("fieldSchemaInvalid")).toBe("1");
    fireEvent.change(label(7), { target: { value: "Size" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Type of field 7" }), { target: { value: "select" } });
    expect(screen.getByText("Add at least one choice")).toBeTruthy();
    const add = screen.getByRole("textbox", { name: "Add choice to Size" });
    fireEvent.change(add, { target: { value: " S " } });
    fireEvent.keyDown(add, { key: "Enter" });
    expect(schema()[6]).toEqual({ key: "size", label: "Size", type: "select", options: ["S"] });
  });

  it("moves a field down and up", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Move Platform down" }));
    expect(schema().map((f: { key: string }) => f.key).slice(0, 2)).toEqual(["contentType", "platform"]);
    expect((screen.getByRole("button", { name: "Move Content type up" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("removes a choice with its chip button", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Remove choice Urgent" }));
    expect(schema()[1].options).toEqual(["Campaign", "Daily", "Story"]);
  });

  it("removing a field that requests have answered asks first", async () => {
    view(124);
    fireEvent.click(screen.getByRole("button", { name: "Remove Shooting" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("124 requests have answers for this field. They're kept, but won't show any more.");
    expect(schema().map((f: { key: string }) => f.key)).toContain("shooting");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove field" }));
    expect(schema().map((f: { key: string }) => f.key)).not.toContain("shooting");
  });

  // "Published link" is stored as `publishedUrl`: a key generated from the label would be `publishedLink`, leaving the
  // 124 answers hidden. Adding it back before saving must reuse the removed field's key.
  it("removing a field and adding it back with the same label keeps its key", async () => {
    view(124);
    fireEvent.click(screen.getByRole("button", { name: "Remove Published link" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove field" }));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    fireEvent.change(label(6), { target: { value: "published LINK" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Type of field 6" }), { target: { value: "url" } });
    expect(schema()[5]).toMatchObject({ key: "publishedUrl", label: "published LINK", type: "url" });
  });

  it("a new field is removed without asking, and Checkbox rows have no Required switch", () => {
    view(124);
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    fireEvent.change(label(7), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Draft" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Label of field 7" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Required: Shooting" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Required: Platform" }).getAttribute("aria-checked")).toBe("true");
  });

  it("posts the draft rows so a failed save can restore them", () => {
    view();
    fireEvent.change(label(1), { target: { value: "Channel" } });
    expect(JSON.parse(String(posted().get("fieldRows")))[0]).toMatchObject({ key: "platform", label: "Channel" });
  });
});
