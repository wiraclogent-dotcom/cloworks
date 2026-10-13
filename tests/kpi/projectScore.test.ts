import { describe, it, expect } from "vitest";
import type { ItemFacts } from "@/lib/kpi/projectItems";
import { PROJECT_KPI_WEIGHTS, cycleDays, median, scoreQuarter, scoreYear, type QuarterScore } from "@/lib/kpi/projectScore";

const DAY = 86_400_000;
const T0 = new Date("2026-07-01T00:00:00+07:00");

const item = (o: Partial<ItemFacts> = {}): ItemFacts => ({
  projectId: "p1", projectTitle: "Project", itemTitle: "Poster", state: "open", dueDate: null,
  bucket: { year: 2026, quarter: 3 }, startAt: null, finishAt: null, progress: 0, onTime: null,
  revisions: 0, slips: 0, ...o,
});
const doneItem = (o: Partial<ItemFacts> = {}) => item({ state: "done", progress: 1, onTime: true, ...o });
const withCycle = (days: number, o: Partial<ItemFacts> = {}) =>
  doneItem({ startAt: T0, finishAt: new Date(T0.getTime() + days * DAY), ...o });

describe("PROJECT_KPI_WEIGHTS", () => {
  it("has the exact constants", () => {
    expect(PROJECT_KPI_WEIGHTS).toEqual({ onTime: 0.5, completion: 0.2, speed: 0.1, revisions: 0.1, slips: 0.1 });
  });
});

describe("median", () => {
  it("returns null for empty, middle for odd, mean of middle two for even", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("cycleDays", () => {
  it("is finish - start in days for done items with both dates", () => {
    expect(cycleDays(withCycle(10))).toBe(10);
  });
  it("is null for untracked, open, or missing dates", () => {
    expect(cycleDays(item({ state: "finishedUntracked", startAt: T0, finishAt: T0 }))).toBeNull();
    expect(cycleDays(item({ state: "open", startAt: T0, finishAt: T0 }))).toBeNull();
    expect(cycleDays(doneItem({ startAt: null, finishAt: T0 }))).toBeNull();
    expect(cycleDays(doneItem({ startAt: T0, finishAt: null }))).toBeNull();
  });
});

describe("scoreQuarter on time", () => {
  it("3 done on time + 1 overdue open + 1 open not due = 75", () => {
    const items = [doneItem(), doneItem(), doneItem(), item({ onTime: false }), item({ onTime: null })];
    const q = scoreQuarter(items, []);
    expect(q.parts.onTime).toBe(75);
    expect(q.onTimeCount).toBe(3);
    expect(q.lateCount).toBe(1);
    expect(q.done).toBe(3);
    expect(q.items).toBe(5);
  });
  it("leaves untracked items out of the on-time count", () => {
    const items = [doneItem(), item({ state: "finishedUntracked", progress: 1, onTime: null })];
    const q = scoreQuarter(items, []);
    expect(q.parts.onTime).toBe(100);
    expect(q.done).toBe(2);
    expect(q.onTimeCount).toBe(1);
    expect(q.lateCount).toBe(0);
  });
  it("is null when nothing was judged", () => {
    expect(scoreQuarter([item()], []).parts.onTime).toBeNull();
  });
});

describe("scoreQuarter completion", () => {
  it("progress [1, .5, 0] = 50", () => {
    const q = scoreQuarter([item({ progress: 1 }), item({ progress: 0.5 }), item({ progress: 0 })], []);
    expect(q.parts.completion).toBe(50);
  });
});

describe("scoreQuarter speed", () => {
  it("team [10,20,30] and person median 10 = 100 (capped)", () => {
    const q = scoreQuarter([withCycle(10)], [10, 20, 30]);
    expect(q.parts.speed).toBe(100);
  });
  it("person median 40 = 50", () => {
    const q = scoreQuarter([withCycle(40)], [10, 20, 30]);
    expect(q.parts.speed).toBe(50);
  });
  it("is null when the team has only 2 values", () => {
    expect(scoreQuarter([withCycle(10)], [10, 20]).parts.speed).toBeNull();
  });
  it("is null when the person has no tracked finish", () => {
    expect(scoreQuarter([item()], [10, 20, 30]).parts.speed).toBeNull();
  });
});

describe("scoreQuarter revisions and slips", () => {
  it("2 revisions over 4 items = 87.5 -> 88", () => {
    const items = [item({ revisions: 2 }), item(), item(), item()];
    expect(scoreQuarter(items, []).parts.revisions).toBe(88);
  });
  it("8 revisions over 2 items = 0", () => {
    expect(scoreQuarter([item({ revisions: 8 }), item()], []).parts.revisions).toBe(0);
  });
  it("slips use the same formula", () => {
    expect(scoreQuarter([item({ slips: 2 }), item(), item(), item()], []).parts.slips).toBe(88);
    expect(scoreQuarter([item({ slips: 8 }), item()], []).parts.slips).toBe(0);
  });
});

describe("scoreQuarter weighting", () => {
  it("shares weight when speed and onTime are null", () => {
    const items = [item({ progress: 1, revisions: 1 }), item({ progress: 0.5, slips: 1 }), item({ progress: 0 }), item({ progress: 0.25 })];
    const q = scoreQuarter(items, []);
    const c = (1 + 0.5 + 0 + 0.25) / 4 * 100;
    const r = 100 - 25 * (1 / 4);
    const s = 100 - 25 * (1 / 4);
    expect(q.parts.onTime).toBeNull();
    expect(q.parts.speed).toBeNull();
    expect(q.usedParts).toHaveLength(3);
    expect(q.usedParts).toEqual(["completion", "revisions", "slips"]);
    expect(q.score).toBe(Math.round((0.2 * c + 0.1 * r + 0.1 * s) / 0.4));
  });
  it("uses unrounded parts and rounds once", () => {
    // revisions 87.5, slips 100, completion 0, onTime null, speed null -> (0 + 8.75 + 10) / 0.4 = 46.875 -> 47
    const q = scoreQuarter([item({ revisions: 2 }), item(), item(), item()], []);
    expect(q.score).toBe(47);
  });
  it("score is null with no items", () => {
    const q = scoreQuarter([], [10, 20, 30]);
    expect(q.score).toBeNull();
    expect(q.usedParts).toEqual([]);
    expect(q.items).toBe(0);
  });
  it("ignores cancelled and removed items", () => {
    const q = scoreQuarter([doneItem(), item({ state: "cancelled", progress: 0 }), item({ state: "removed" })], []);
    expect(q.items).toBe(1);
    expect(q.parts.completion).toBe(100);
  });
});

describe("scoreYear", () => {
  const qs = (score: number | null, items: number): QuarterScore => ({
    score, parts: { onTime: null, completion: null, speed: null, revisions: null, slips: null },
    usedParts: [], items, done: 0, onTimeCount: 0, lateCount: 0,
  });
  it("weights quarters by item count: Q3 80x2 + Q4 50x8 = 56", () => {
    expect(scoreYear([qs(80, 2), qs(50, 8)])).toBe(56);
  });
  it("is null when all quarters are null", () => {
    expect(scoreYear([qs(null, 3), qs(null, 0)])).toBeNull();
    expect(scoreYear([])).toBeNull();
  });
  it("skips null-score and zero-item quarters", () => {
    expect(scoreYear([qs(null, 5), qs(90, 0), qs(70, 1)])).toBe(70);
  });
});
