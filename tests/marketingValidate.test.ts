import { describe, it, expect } from "vitest";
import { validateActivity, validateAnnouncement, validateProductFocus } from "@/lib/marketing/validate";
import { MarketingError } from "@/lib/marketing/errors";

const ok = { title: "Payday flight", divisionId: "ads", startDay: "2026-10-24", endDay: "2026-10-31", status: "CONFIRMED" };
const errorsOf = (fn: () => unknown) => {
  try { fn(); } catch (e) {
    expect(e).toBeInstanceOf(MarketingError);
    expect((e as MarketingError).code).toBe("INVALID");
    return (e as MarketingError).fieldErrors;
  }
  throw new Error("did not throw");
};

describe("validateActivity", () => {
  it("trims and returns a valid activity", () => {
    expect(validateActivity({ ...ok, title: "  Payday flight  " })).toEqual({ ...ok, status: "CONFIRMED" });
  });
  it("needs a title", () => expect(errorsOf(() => validateActivity({ ...ok, title: "   " }))).toEqual({ title: "Enter a title." }));
  it("caps the title at 120", () => {
    expect(validateActivity({ ...ok, title: "x".repeat(120) }).title).toHaveLength(120);
    expect(errorsOf(() => validateActivity({ ...ok, title: "x".repeat(121) }))).toEqual({ title: "Title must be 120 characters or fewer." });
  });
  it("rejects unreal dates", () => expect(errorsOf(() => validateActivity({ ...ok, startDay: "2026-02-30" }))).toEqual({ startDay: "Pick a valid date." }));
  it("rejects an end before the start", () =>
    expect(errorsOf(() => validateActivity({ ...ok, startDay: "2026-10-10", endDay: "2026-10-09" }))).toEqual({ endDay: "End date can't be before the start date." }));
  it("allows one day", () => expect(validateActivity({ ...ok, startDay: "2026-10-15", endDay: "2026-10-15" }).endDay).toBe("2026-10-15"));
  it("allows 366 days and rejects 367", () => {
    expect(validateActivity({ ...ok, startDay: "2026-01-01", endDay: "2027-01-01" }).endDay).toBe("2027-01-01");
    expect(errorsOf(() => validateActivity({ ...ok, startDay: "2026-01-01", endDay: "2027-01-02" }))).toEqual({ endDay: "Pick a range of 366 days or fewer." });
  });
  it("rejects an unknown status", () => expect(errorsOf(() => validateActivity({ ...ok, status: "LATE" }))).toEqual({ status: "Pick a status." }));
});

describe("validateAnnouncement", () => {
  const base = { month: "2026-10", body: "Inbound China", startDay: null, endDay: null };
  it("keeps an undated announcement in its month", () => expect(validateAnnouncement({ ...base, body: "  Budget approved " })).toEqual({ ...base, body: "Budget approved" }));
  it("needs a body", () => expect(errorsOf(() => validateAnnouncement({ ...base, body: "" }))).toEqual({ body: "Write the announcement." }));
  it("caps the body at 500", () =>
    expect(errorsOf(() => validateAnnouncement({ ...base, body: "x".repeat(501) }))).toEqual({ body: "Announcement must be 500 characters or fewer." }));
  it("needs both dates or neither", () =>
    expect(errorsOf(() => validateAnnouncement({ ...base, startDay: "2026-10-22" }))).toEqual({ endDay: "Set both dates or neither." }));
  it("files a dated announcement under the month of its start", () =>
    expect(validateAnnouncement({ month: "2026-11", body: "x", startDay: "2026-10-30", endDay: "2026-11-02" }).month).toBe("2026-10"));
  it("checks dated ranges like activities", () =>
    expect(errorsOf(() => validateAnnouncement({ ...base, startDay: "2026-10-24", endDay: "2026-10-22" }))).toEqual({ endDay: "End date can't be before the start date." }));
  it("rejects a bad month", () => expect(errorsOf(() => validateAnnouncement({ ...base, month: "2026-13" }))).toEqual({ month: "Pick a valid month." }));
});

describe("validateProductFocus", () => {
  it("trims, and blank clears", () => {
    expect(validateProductFocus("  Lavender 1L ")).toBe("Lavender 1L");
    expect(validateProductFocus("  ")).toBe("");
  });
  it("caps at 500", () => expect(errorsOf(() => validateProductFocus("x".repeat(501)))).toEqual({ productFocus: "Product focus must be 500 characters or fewer." }));
});
