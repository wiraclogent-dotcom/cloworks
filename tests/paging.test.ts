import { describe, it, expect } from "vitest";
import { BOARD_MAX_PER_COLUMN, BOARD_PAGE_SIZE, TABLE_PAGE_SIZE, pageWindow, parseMore, parsePage, rangeText, serializeMore } from "@/lib/paging";
import { hrefWith, parseParams } from "@/app/(app)/requests/params";

describe("paging constants", () => {
  it("uses 25 per board column (cap 500) and 50 per table page", () => {
    expect([BOARD_PAGE_SIZE, BOARD_MAX_PER_COLUMN, TABLE_PAGE_SIZE]).toEqual([25, 500, 50]);
  });
});

describe("parseMore", () => {
  it("accepts whitelisted STATUS:n pairs, repeated or comma separated", () => {
    expect(parseMore("DONE:50")).toEqual({ DONE: 50 });
    expect(parseMore(["DONE:50", "REQUESTED:75"])).toEqual({ DONE: 50, REQUESTED: 75 });
    expect(parseMore("DONE:50,FIRST_LOOK:100")).toEqual({ DONE: 50, FIRST_LOOK: 100 });
  });
  it("caps at 500 and never goes below one page", () => {
    expect(parseMore("DONE:99999")).toEqual({ DONE: 500 });
    expect(parseMore("DONE:500")).toEqual({ DONE: 500 });
    expect(parseMore("DONE:1")).toEqual({ DONE: 25 });
  });
  it("drops unknown statuses and malformed numbers", () => {
    expect(parseMore("NOPE:50")).toEqual({});
    expect(parseMore("DONE:abc")).toEqual({});
    expect(parseMore("DONE:-5")).toEqual({});
    expect(parseMore("DONE:5.5")).toEqual({});
    expect(parseMore("DONE:")).toEqual({});
    expect(parseMore("DONE:1e3")).toEqual({});
    expect(parseMore("DONE:12345678901234567890")).toEqual({});
    expect(parseMore("__proto__:50")).toEqual({});
    expect(parseMore(undefined)).toEqual({});
    expect(parseMore("")).toEqual({});
  });
  it("round-trips through serializeMore", () => {
    expect(serializeMore({ DONE: 50, REQUESTED: 75 })).toBe("REQUESTED:75,DONE:50");
    expect(parseMore(serializeMore({ DONE: 50 }))).toEqual({ DONE: 50 });
    expect(serializeMore({})).toBeUndefined();
  });
});

describe("parsePage / pageWindow / rangeText", () => {
  it("parses only positive whole numbers", () => {
    expect(parsePage("3")).toBe(3);
    for (const v of [undefined, "", "0", "-2", "x", "1.5", "2e3"]) expect(parsePage(v)).toBe(1);
    expect(parsePage(["4", "9"])).toBe(4);
    expect(parsePage("99999999999999999999")).toBe(1);
  });
  it("clamps the page into range and computes skip/from/to", () => {
    expect(pageWindow(553, 1, 50)).toEqual({ page: 1, pageCount: 12, skip: 0, from: 1, to: 50 });
    expect(pageWindow(553, 12, 50)).toEqual({ page: 12, pageCount: 12, skip: 550, from: 551, to: 553 });
    expect(pageWindow(553, 99, 50)).toMatchObject({ page: 12, skip: 550 });
    expect(pageWindow(50, 2, 50)).toMatchObject({ page: 1, pageCount: 1 });
    expect(pageWindow(0, 5, 50)).toEqual({ page: 1, pageCount: 1, skip: 0, from: 0, to: 0 });
  });
  it("renders the range text", () => {
    expect(rangeText(pageWindow(553, 1, 50), 553)).toBe("Showing 1–50 of 553");
    expect(rangeText(pageWindow(553, 12, 50), 553)).toBe("Showing 551–553 of 553");
    expect(rangeText(pageWindow(0, 1, 50), 0)).toBe("Showing 0 of 0");
  });
});

describe("params: more and page", () => {
  it("parses more and page into ViewParams", () => {
    const p = parseParams({ more: "DONE:50", page: "3", view: "table" });
    expect(p.more).toEqual({ DONE: 50 });
    expect(p.page).toBe(3);
    expect(parseParams({}).page).toBe(1);
    expect(parseParams({}).more).toEqual({});
  });
  it("hrefWith drops page/more by default and keeps every other param", () => {
    const p = parseParams({ view: "table", status: "DONE", q: "x", mine: "1", sort: "title", dir: "desc", page: "4", more: "DONE:50" });
    expect(hrefWith(p, {})).toBe("/requests?view=table&status=DONE&q=x&mine=1&sort=title&dir=desc");
    expect(hrefWith(p, { page: "5" })).toBe("/requests?view=table&status=DONE&q=x&mine=1&sort=title&dir=desc&page=5");
    const b = parseParams({ brand: "b1", more: "DONE:50" });
    expect(hrefWith(b, { more: "DONE:75" })).toBe("/requests?brand=b1&more=DONE%3A75");
  });
});
