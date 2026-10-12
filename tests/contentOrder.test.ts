import { describe, expect, it } from "vitest";
import { needsRenumber, outOfOrder, positionBetween, renumber, suggestDate } from "@/lib/content/order";

// Dates given as Jakarta calendar days (noon Jakarta = 05:00Z).
const d = (s: string | null) => (s ? new Date(`${s}T05:00:00Z`) : null);
const tiles = (rows: [string, string | null][]) => rows.map(([id, p]) => ({ id, plannedAt: d(p) }));

describe("positionBetween", () => {
  it("handles the edges and midpoint", () => {
    expect(positionBetween(null, null)).toBe(0);
    expect(positionBetween(null, 5)).toBe(6);
    expect(positionBetween(3, null)).toBe(2);
    expect(positionBetween(4, 2)).toBe(3);
  });
});

describe("needsRenumber", () => {
  it("is true only when both set and too close", () => {
    expect(needsRenumber(1, 1 + 1e-7)).toBe(true);
    expect(needsRenumber(2, 1)).toBe(false);
    expect(needsRenumber(null, 1)).toBe(false);
    expect(needsRenumber(1, null)).toBe(false);
  });
});

describe("renumber", () => {
  it("gives top to bottom n-1 … 0", () => {
    expect(renumber(["a", "b", "c"])).toEqual([
      { id: "a", position: 2 },
      { id: "b", position: 1 },
      { id: "c", position: 0 },
    ]);
    expect(renumber([])).toEqual([]);
  });
});

describe("outOfOrder", () => {
  it("ignores undated tiles and equal dates", () => {
    const t = tiles([["a", null], ["b", "2026-10-20"], ["c", "2026-10-20"], ["d", null], ["e", "2026-10-18"]]);
    expect(outOfOrder(t).size).toBe(0);
  });

  it("flags a tile later than the nearest dated tile above", () => {
    expect([...outOfOrder(tiles([["a", "2026-10-18"], ["b", "2026-10-20"]]))]).toEqual(["b"]);
  });

  it("compares by Jakarta day, not instant", () => {
    const t = [
      { id: "a", plannedAt: new Date("2026-10-20T01:00:00Z") }, // 08:00 Jakarta
      { id: "b", plannedAt: new Date("2026-10-20T16:00:00Z") }, // 23:00 Jakarta, same day
    ];
    expect(outOfOrder(t).size).toBe(0);
  });
});

describe("suggestDate", () => {
  it("takes the midpoint of the nearest dated neighbours", () => {
    const t = tiles([["a", "2026-10-24"], ["b", "2026-10-30"], ["c", "2026-10-20"]]);
    expect(suggestDate(t, "b")).toBe("2026-10-22");
  });

  it("rounds down", () => {
    const t = tiles([["a", "2026-10-25"], ["b", null], ["c", "2026-10-20"]]);
    expect(suggestDate(t, "b")).toBe("2026-10-22");
  });

  it("skips undated neighbours", () => {
    const t = tiles([["a", "2026-10-24"], ["x", null], ["b", null], ["y", null], ["c", "2026-10-20"]]);
    expect(suggestDate(t, "b")).toBe("2026-10-22");
  });

  it("uses one neighbour ±1 day, including across month ends", () => {
    expect(suggestDate(tiles([["a", "2026-10-31"], ["b", null]]), "b")).toBe("2026-10-30");
    expect(suggestDate(tiles([["b", null], ["c", "2026-10-31"]]), "b")).toBe("2026-11-01");
  });

  it("returns null with no dated neighbours or unknown id", () => {
    expect(suggestDate(tiles([["a", null], ["b", null]]), "b")).toBeNull();
    expect(suggestDate(tiles([["a", null]]), "zzz")).toBeNull();
  });
});
