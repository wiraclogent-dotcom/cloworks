import { describe, it, expect } from "vitest";
import { itemFacts, jakartaQuarter, quarterBounds, type ItemEvent, type ItemRow } from "@/lib/kpi/projectItems";
import { jakartaDay } from "@/lib/projectTasks";

const row = (id: string, o: Partial<ItemRow> = {}): ItemRow => ({
  id, title: "Poster", stage: "NOT_STARTED", status: null, startDate: null, dueDate: null, ownerId: "u1", ...o,
});
const ev = (taskId: string, kind: ItemEvent["kind"], fromValue: string | null, toValue: string | null, at: string, actorId = "a1"): ItemEvent => ({
  taskId, kind, fromValue, toValue, actorId, at: new Date(at),
});
const facts = (projectRows: ItemRow[], events: ItemEvent[] = [], now = "2026-10-13T05:00:00Z") =>
  itemFacts({ projectId: "p1", projectTitle: "Project", itemTitle: "Poster", projectRows, events, now: new Date(now) });

describe("jakartaQuarter / quarterBounds", () => {
  it("2026-12-31T20:00Z is already Q1 2027 in Jakarta", () => {
    expect(jakartaQuarter(new Date("2026-12-31T20:00:00Z"))).toEqual({ year: 2027, quarter: 1 });
  });
  it("2026-12-31T16:00Z (23:00 Jakarta) is still Q4 2026", () => {
    expect(jakartaQuarter(new Date("2026-12-31T16:00:00Z"))).toEqual({ year: 2026, quarter: 4 });
  });
  it("bounds are Jakarta midnight, end exclusive", () => {
    const b = quarterBounds(2026, 4);
    expect(b.start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-12-31T17:00:00.000Z");
    expect(quarterBounds(2026, 1).start.toISOString()).toBe("2025-12-31T17:00:00.000Z");
  });
});

describe("itemFacts", () => {
  it("due date is the latest of the live rows and sets the bucket", () => {
    const f = facts([
      row("1", { dueDate: jakartaDay("2026-11-10") }), row("2"), row("3", { dueDate: jakartaDay("2026-12-05") }),
    ]);
    expect(f.dueDate).toEqual(jakartaDay("2026-12-05"));
    expect(f.bucket).toEqual({ year: 2026, quarter: 4 });
  });
  it("all rows without a due date -> unscheduled", () => {
    const f = facts([row("1"), row("2")]);
    expect(f.dueDate).toBeNull();
    expect(f.bucket).toBe("unscheduled");
  });

  const finalRows = (due: string) => [
    row("1", { stage: "FINAL_ARTWORK", dueDate: jakartaDay(due) }), row("2", { stage: "FINAL_ARTWORK", dueDate: jakartaDay(due) }),
  ];
  const finalEvents = [
    ev("1", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-20T03:00:00Z"),
    ev("2", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-28T03:00:00Z"),
  ];
  it("done item: finishAt is the latest finishing event, on time before the due day ends", () => {
    const f = facts(finalRows("2026-11-30"), finalEvents);
    expect(f.state).toBe("done");
    expect(f.finishAt).toEqual(new Date("2026-11-28T03:00:00Z"));
    expect(f.onTime).toBe(true);
  });
  it("done item finished after the due day -> late", () => {
    const f = facts(finalRows("2026-11-25"), finalEvents);
    expect(f.state).toBe("done");
    expect(f.onTime).toBe(false);
  });
  it("finishing at 23:59 Jakarta on the due day is still on time", () => {
    const f = facts(finalRows("2026-11-28"), [
      ev("1", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-20T03:00:00Z"),
      ev("2", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-28T16:59:59Z"),
    ]);
    expect(f.onTime).toBe(true);
  });
  it("open and overdue -> onTime false", () => {
    const f = facts([row("1", { stage: "APPROVAL", dueDate: jakartaDay("2026-10-01") })]);
    expect(f.state).toBe("open");
    expect(f.onTime).toBe(false);
  });
  it("open and not yet due -> onTime null", () => {
    const f = facts([row("1", { stage: "APPROVAL", dueDate: jakartaDay("2026-10-20") })]);
    expect(f.onTime).toBeNull();
  });
  it("open on its due day (before 23:59 Jakarta) is not overdue", () => {
    const f = facts([row("1", { stage: "APPROVAL", dueDate: jakartaDay("2026-10-13") })], [], "2026-10-13T16:00:00Z");
    expect(f.onTime).toBeNull();
  });
  it("every FINAL row without an event -> finishedUntracked, onTime null", () => {
    const f = facts([row("1", { stage: "FINAL_ARTWORK", dueDate: jakartaDay("2026-11-30") })]);
    expect(f.state).toBe("finishedUntracked");
    expect(f.finishAt).toBeNull();
    expect(f.onTime).toBeNull();
  });
  it("two FINAL rows, only one with an event -> done at that event, onTime judged normally", () => {
    const f = facts(finalRows("2026-11-30"), [ev("1", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-28T03:00:00Z")]);
    expect(f.state).toBe("done");
    expect(f.finishAt).toEqual(new Date("2026-11-28T03:00:00Z"));
    expect(f.onTime).toBe(true);
    expect(facts(finalRows("2026-11-25"), [ev("1", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-28T03:00:00Z")]).onTime).toBe(false);
  });
  it("uses the last event that set a row done", () => {
    const f = facts([row("1", { stage: "FINAL_ARTWORK", dueDate: jakartaDay("2026-11-30") })], [
      ev("1", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-10T03:00:00Z"),
      ev("1", "STAGE", "FINAL_ARTWORK", "APPROVAL", "2026-11-11T03:00:00Z"),
      ev("1", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-15T03:00:00Z"),
    ]);
    expect(f.finishAt).toEqual(new Date("2026-11-15T03:00:00Z"));
  });
  it("status-mode project uses STATUS -> DONE", () => {
    const rows = [row("1", { stage: null, status: "DONE", dueDate: jakartaDay("2026-11-30") })];
    const f = facts(rows, [ev("1", "STATUS", "IN_PROGRESS", "DONE", "2026-11-12T03:00:00Z")]);
    expect(f.state).toBe("done");
    expect(f.finishAt).toEqual(new Date("2026-11-12T03:00:00Z"));
    expect(f.progress).toBe(1);
  });
  it("taskMode comes from the whole project, not only the item's rows", () => {
    // Item-only would be stage mode (APPROVAL = 0.8); the status-only sibling makes the project status mode (IN_PROGRESS = 0.5).
    const rows = [
      row("1", { stage: "APPROVAL", status: "IN_PROGRESS" }),
      row("2", { title: "Other", stage: null, status: "IN_PROGRESS" }),
    ];
    expect(facts(rows).progress).toBe(0.5);
  });
  it("events of other rows are ignored for finishAt", () => {
    const rows = [row("1", { stage: "FINAL_ARTWORK", dueDate: jakartaDay("2026-11-30") }), row("9", { title: "Other" })];
    const f = facts(rows, [
      ev("9", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-12-20T03:00:00Z"),
      ev("1", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-20T03:00:00Z"),
    ]);
    expect(f.finishAt).toEqual(new Date("2026-11-20T03:00:00Z"));
  });
  it("slips and revisions on another item's row are ignored", () => {
    const rows = [row("1", { stage: "MANUSCRIPT" }), row("9", { title: "Other", stage: "MANUSCRIPT" })];
    const f = facts(rows, [
      ev("9", "DUE", "2026-11-15", "2026-11-30", "2026-10-05T03:00:00Z"),
      ev("9", "STAGE", "APPROVAL", "MANUSCRIPT", "2026-10-06T03:00:00Z"),
    ]);
    expect(f.slips).toBe(0);
    expect(f.revisions).toBe(0);
  });
  it("slips and revisions on a cancelled row of a partly-live item are ignored", () => {
    const rows = [row("1", { stage: "MANUSCRIPT" }), row("2", { stage: "CANCELLED" })];
    const f = facts(rows, [
      ev("2", "DUE", "2026-11-15", "2026-11-30", "2026-10-05T03:00:00Z"),
      ev("2", "STAGE", "APPROVAL", "MANUSCRIPT", "2026-10-06T03:00:00Z"),
    ]);
    expect(f.slips).toBe(0);
    expect(f.revisions).toBe(0);
  });
  it("a STATUS revision-shaped event on a stage-mode item is not a revision", () => {
    const f = facts([row("1", { stage: "MANUSCRIPT", status: "IN_PROGRESS" })], [
      ev("1", "STATUS", "DONE", "IN_PROGRESS", "2026-10-02T03:00:00Z"),
    ]);
    expect(f.revisions).toBe(0);
  });
  it("a STAGE backward move on a status-mode item is not a revision", () => {
    const f = facts([row("1", { stage: null, status: "IN_PROGRESS" })], [
      ev("1", "STAGE", "APPROVAL", "MANUSCRIPT", "2026-10-02T03:00:00Z"),
    ]);
    expect(f.revisions).toBe(0);
  });
  it("finishing at 00:00 Jakarta the day after the due day (17:00Z) is late", () => {
    const f = facts([row("1", { stage: "FINAL_ARTWORK", dueDate: jakartaDay("2026-11-28") })], [
      ev("1", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-28T17:00:00Z"),
    ]);
    expect(f.onTime).toBe(false);
  });
  it("open item at 00:00 Jakarta the day after the due day (17:00Z) is overdue", () => {
    const f = facts([row("1", { stage: "APPROVAL", dueDate: jakartaDay("2026-11-28") })], [], "2026-11-28T17:00:00Z");
    expect(f.onTime).toBe(false);
  });

  it("revisions count backward stage moves only", () => {
    const f = facts([row("1", { stage: "MANUSCRIPT" }), row("2", { stage: "APPROVAL" })], [
      ev("1", "STAGE", "APPROVAL", "TECHNICAL_ARTWORK", "2026-10-02T03:00:00Z"),
      ev("2", "STAGE", "MANUSCRIPT", "APPROVAL", "2026-10-03T03:00:00Z"),
    ]);
    expect(f.revisions).toBe(1);
  });
  it("moving to CANCELLED is not a revision", () => {
    const f = facts([row("1")], [ev("1", "STAGE", "TECHNICAL_ARTWORK", "CANCELLED", "2026-10-02T03:00:00Z")]);
    expect(f.revisions).toBe(0);
  });
  it("status-mode revisions: DONE/IN_REVIEW back to IN_PROGRESS/NOT_STARTED", () => {
    const rows = [row("1", { stage: null, status: "IN_PROGRESS" })];
    const f = facts(rows, [
      ev("1", "STATUS", "DONE", "IN_PROGRESS", "2026-10-02T03:00:00Z"),
      ev("1", "STATUS", "IN_REVIEW", "NOT_STARTED", "2026-10-03T03:00:00Z"),
      ev("1", "STATUS", "IN_PROGRESS", "ON_HOLD", "2026-10-04T03:00:00Z"),
    ]);
    expect(f.revisions).toBe(2);
  });

  const due = (from: string | null, to: string | null, at: string, taskId = "1", actorId = "a1") => ev(taskId, "DUE", from, to, at, actorId);
  const twoRows = [row("1"), row("2")];
  it("two rows pushed 30 s apart by one actor are one slip", () => {
    const f = facts(twoRows, [
      due("2026-11-15", "2026-11-30", "2026-10-05T03:00:00Z", "1"),
      due("2026-11-30", "2026-12-10", "2026-10-05T03:00:30Z", "2"),
    ]);
    expect(f.slips).toBe(1);
  });
  it("the same pair a day apart is two slips", () => {
    const f = facts(twoRows, [
      due("2026-11-15", "2026-11-30", "2026-10-05T03:00:00Z", "1"),
      due("2026-11-30", "2026-12-10", "2026-10-06T03:00:00Z", "2"),
    ]);
    expect(f.slips).toBe(2);
  });
  it("different actors within a minute are separate slips", () => {
    const f = facts(twoRows, [
      due("2026-11-15", "2026-11-30", "2026-10-05T03:00:00Z", "1", "a1"),
      due("2026-11-30", "2026-12-10", "2026-10-05T03:00:10Z", "2", "a2"),
    ]);
    expect(f.slips).toBe(2);
  });
  it("the 60 s window is measured from the previous event: 0/40/80 s by one actor is one slip", () => {
    const f = facts([row("1"), row("2"), row("3")], [
      due("2026-11-01", "2026-11-02", "2026-10-05T03:00:00Z", "1"),
      due("2026-11-01", "2026-11-02", "2026-10-05T03:00:40Z", "2"),
      due("2026-11-01", "2026-11-02", "2026-10-05T03:01:20Z", "3"),
    ]);
    expect(f.slips).toBe(1);
  });
  it("a gap over 60 s between consecutive events starts a new slip: 0/70 s is two", () => {
    const f = facts(twoRows, [
      due("2026-11-01", "2026-11-02", "2026-10-05T03:00:00Z", "1"),
      due("2026-11-01", "2026-11-02", "2026-10-05T03:01:10Z", "2"),
    ]);
    expect(f.slips).toBe(2);
  });
  it("pulling a date earlier is not a slip", () => {
    expect(facts(twoRows, [due("2026-11-30", "2026-11-20", "2026-10-05T03:00:00Z")]).slips).toBe(0);
  });
  it("clearing a date (to null) or setting one for the first time (from null) is not a slip", () => {
    const f = facts(twoRows, [
      due("2026-11-30", null, "2026-10-05T03:00:00Z", "1"),
      due(null, "2026-11-30", "2026-10-06T03:00:00Z", "2"),
    ]);
    expect(f.slips).toBe(0);
  });

  it("progress averages live rows in stage mode", () => {
    const f = facts([row("1", { stage: "FINAL_ARTWORK" }), row("2", { stage: "APPROVAL" }), row("3", { stage: null })]);
    expect(f.progress).toBeCloseTo((1 + 0.8 + 0) / 3, 10);
  });
  it("cancelled rows are left out of progress, due date and done", () => {
    const f = facts([
      row("1", { stage: "FINAL_ARTWORK", dueDate: jakartaDay("2026-11-10") }),
      row("2", { stage: "CANCELLED", dueDate: jakartaDay("2026-12-30") }),
    ], [ev("1", "STAGE", "APPROVAL", "FINAL_ARTWORK", "2026-11-05T03:00:00Z")]);
    expect(f.state).toBe("done");
    expect(f.progress).toBe(1);
    expect(f.dueDate).toEqual(jakartaDay("2026-11-10"));
  });
  it("status-mode progress weights", () => {
    const rows = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "DONE"].map((s, i) =>
      row(String(i), { stage: null, status: s as ItemRow["status"] }));
    expect(facts(rows).progress).toBeCloseTo((0 + 0.5 + 0.8 + 0.5 + 1) / 5, 10);
  });

  it("a CANCELLED status row weighs 0 progress (it never earns credit)", () => {
    const rows = ["DONE", "CANCELLED"].map((s, i) => row(String(i), { stage: null, status: s as ItemRow["status"] }));
    expect(facts(rows).progress).toBeCloseTo((1 + 0) / 2, 10);
  });

  it("startAt is the earliest live startDate", () => {
    const f = facts([row("1", { startDate: jakartaDay("2026-10-05") }), row("2", { startDate: jakartaDay("2026-10-03") })]);
    expect(f.startAt).toEqual(jakartaDay("2026-10-03"));
  });
  it("startAt falls back to the first event leaving NOT_STARTED / null", () => {
    const f = facts([row("1", { stage: "MANUSCRIPT" }), row("2", { stage: "MANUSCRIPT" })], [
      ev("2", "STAGE", "NOT_STARTED", "FIRST_PREVIEW", "2026-10-04T03:00:00Z"),
      ev("1", "STAGE", null, "FIRST_PREVIEW", "2026-10-03T03:00:00Z"),
      ev("1", "STAGE", "FIRST_PREVIEW", "MANUSCRIPT", "2026-10-02T03:00:00Z"),
    ]);
    expect(f.startAt).toEqual(new Date("2026-10-03T03:00:00Z"));
  });
  it("startAt skips a null -> NOT_STARTED event and uses the first move off NOT_STARTED", () => {
    const f = facts([row("1", { stage: "FIRST_PREVIEW" })], [
      ev("1", "STAGE", null, "NOT_STARTED", "2026-10-01T03:00:00Z"),
      ev("1", "STAGE", "NOT_STARTED", "FIRST_PREVIEW", "2026-10-20T03:00:00Z"),
    ]);
    expect(f.startAt).toEqual(new Date("2026-10-20T03:00:00Z"));
  });
  it("startAt is null with no startDate and no events", () => {
    expect(facts([row("1")]).startAt).toBeNull();
  });

  it("all rows CANCELLED -> cancelled", () => {
    const f = facts([row("1", { stage: "CANCELLED", dueDate: jakartaDay("2026-11-10") })], [
      ev("1", "STAGE", "APPROVAL", "MANUSCRIPT", "2026-10-02T03:00:00Z"),
    ]);
    expect(f.state).toBe("cancelled");
    expect(f.dueDate).toBeNull();
    expect(f.bucket).toBe("unscheduled");
    expect(f.progress).toBe(0);
    expect(f.onTime).toBeNull();
    expect(f.revisions).toBe(1);
  });
  it("no rows with the title -> removed", () => {
    const f = itemFacts({
      projectId: "p1", projectTitle: "Project", itemTitle: "Poster",
      projectRows: [row("9", { title: "Other" })], events: [ev("9", "STAGE", "APPROVAL", "MANUSCRIPT", "2026-10-02T03:00:00Z")], now: new Date("2026-10-13T05:00:00Z"),
    });
    expect(f.state).toBe("removed");
    expect(f.bucket).toBe("unscheduled");
    expect(f.revisions).toBe(0);
    expect(f.slips).toBe(0);
    expect(f.progress).toBe(0);
    expect(f.onTime).toBeNull();
  });
  it("copies the project and item titles", () => {
    const f = facts([row("1")]);
    expect(f).toMatchObject({ projectId: "p1", projectTitle: "Project", itemTitle: "Poster" });
  });
});
