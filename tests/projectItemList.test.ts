import { describe, it, expect } from "vitest";
import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { groupItems, itemSlug, needsAttention, type ItemRowInput } from "@/lib/projectItemList";

let n = 0;
const row = (over: Partial<ItemRowInput> & { title?: string }): ItemRowInput => ({
  id: `r${++n}`,
  title: "A",
  subTitle: null,
  position: n,
  ownerId: null,
  ownerName: null,
  stage: null,
  status: null,
  startDate: null,
  dueDate: null,
  dueTbc: false,
  ...over,
});
const d = (iso: string) => new Date(`${iso}T00:00:00+07:00`);
const stageRow = (stage: ProjectStage | null, over: Partial<ItemRowInput> = {}) => row({ stage, ...over });
const statusRow = (status: ProjectStatus | null, over: Partial<ItemRowInput> = {}) => row({ status, ...over });

describe("projectItemList", () => {
  describe("itemSlug", () => {
    it("slugifies titles", () => {
      expect(itemSlug("Laundry Pods Regular 4", new Set())).toBe("laundry-pods-regular-4");
      expect(itemSlug("Pods – Lite!", new Set())).toBe("pods-lite");
      expect(itemSlug("Crème Brûlée", new Set())).toBe("creme-brulee");
      expect(itemSlug("日本", new Set())).toBe("item");
    });

    it("appends a counter when the slug is taken and records the result", () => {
      const taken = new Set<string>();
      expect(itemSlug("Cloghome 200", taken)).toBe("cloghome-200");
      expect(itemSlug("CLOGHOME-200!", taken)).toBe("cloghome-200-2");
      expect(itemSlug("cloghome 200", taken)).toBe("cloghome-200-3");
      expect(taken.has("cloghome-200-3")).toBe(true);
    });

    it("gives groupItems stable slugs across calls", () => {
      const rows = [row({ title: "Cloghome 200" }), row({ title: "Cloghome-200" }), row({ title: "日本" })];
      const a = groupItems(rows).map((i) => i.slug);
      const b = groupItems(rows).map((i) => i.slug);
      expect(a).toEqual(["cloghome-200", "cloghome-200-2", "item"]);
      expect(b).toEqual(a);
    });
  });

  describe("groupItems", () => {
    it("orders items by first appearance by position and rows by position", () => {
      const rows = [row({ title: "B", position: 3 }), row({ title: "A", position: 1 }), row({ title: "B", position: 2 })];
      const items = groupItems(rows);
      expect(items.map((i) => i.title)).toEqual(["A", "B"]);
      expect(items[1].rows.map((r) => r.position)).toEqual([2, 3]);
    });

    it("uses the latest live due date and ignores cancelled rows", () => {
      const items = groupItems([
        stageRow("APPROVAL", { dueDate: d("2026-11-10") }),
        stageRow("APPROVAL", { dueDate: d("2026-12-05") }),
        stageRow("CANCELLED", { dueDate: d("2027-01-01") }),
      ]);
      expect(items[0].dueDate).toEqual(d("2026-12-05"));
      expect(items[0].dueTbc).toBe(false);
    });

    it("is dueTbc with no date when no live row has a date and one is TBC", () => {
      const items = groupItems([stageRow("APPROVAL"), stageRow("APPROVAL", { dueTbc: true })]);
      expect(items[0].dueDate).toBeNull();
      expect(items[0].dueTbc).toBe(true);
    });

    it("collects distinct owners of live rows in row order", () => {
      const items = groupItems([
        stageRow("APPROVAL", { ownerName: "Sari" }),
        stageRow("APPROVAL", { ownerName: "Budi" }),
        stageRow("APPROVAL", { ownerName: "Sari" }),
        stageRow("CANCELLED", { ownerName: "Gone" }),
        stageRow("APPROVAL"),
      ]);
      expect(items[0].owners).toEqual(["Sari", "Budi"]);
    });

    it("counts live rows per stage in stage order, none last", () => {
      const items = groupItems([
        stageRow("FINAL_ARTWORK"),
        stageRow("APPROVAL"),
        stageRow("APPROVAL"),
        stageRow("CANCELLED"),
        stageRow(null),
      ]);
      expect(items[0].counts).toEqual([
        { key: "APPROVAL", n: 2 },
        { key: "FINAL_ARTWORK", n: 1 },
        { key: "none", n: 1 },
      ]);
    });

    it("counts per status in tracker projects, in TASK_STATUS_ORDER", () => {
      const items = groupItems([statusRow("DONE"), statusRow("IN_PROGRESS")]);
      expect(items[0].counts).toEqual([
        { key: "IN_PROGRESS", n: 1 },
        { key: "DONE", n: 1 },
      ]);
    });

    it("marks an item with only cancelled rows as allCancelled, not done", () => {
      const [item] = groupItems([stageRow("CANCELLED"), stageRow("CANCELLED")]);
      expect(item.allCancelled).toBe(true);
      expect(item.done).toBe(false);
      expect(item.liveRows).toEqual([]);
    });

    it("is done when every live row is done, ignoring cancelled rows", () => {
      const [item] = groupItems([stageRow("FINAL_ARTWORK"), stageRow("CANCELLED"), stageRow("FINAL_ARTWORK")]);
      expect(item.done).toBe(true);
      const [open] = groupItems([stageRow("FINAL_ARTWORK"), stageRow("APPROVAL")]);
      expect(open.done).toBe(false);
    });
  });

  describe("needsAttention", () => {
    const now = new Date("2026-10-14T05:00:00Z");
    const item = (title: string, over: Partial<ItemRowInput> = {}) =>
      groupItems([stageRow("APPROVAL", { title, ...over })])[0];

    it("includes overdue and due-within-7-days items, excludes later ones", () => {
      const out = needsAttention(
        [
          item("overdue", { dueDate: d("2026-10-13") }),
          item("soon", { dueDate: d("2026-10-21") }),
          item("later", { dueDate: d("2026-10-22") }),
        ],
        now,
      );
      expect(out.map((o) => [o.item.title, o.overdue])).toEqual([
        ["overdue", true],
        ["soon", false],
      ]);
    });

    it("excludes done, all-cancelled and undated items", () => {
      const done = groupItems([stageRow("FINAL_ARTWORK", { title: "done", dueDate: d("2026-10-01") })])[0];
      const cancelled = groupItems([stageRow("CANCELLED", { title: "cx", dueDate: d("2026-10-01") })])[0];
      const tbc = item("tbc", { dueTbc: true });
      const none = item("none");
      expect(needsAttention([done, cancelled, tbc, none], now)).toEqual([]);
    });

    it("excludes a tracker item whose live rows are all Done", () => {
      const tracker = groupItems([statusRow("DONE", { title: "T", dueDate: d("2026-10-13") })])[0];
      expect(needsAttention([tracker], now)).toEqual([]);
    });

    it("sorts overdue first (oldest due first), then soonest due", () => {
      const out = needsAttention(
        [
          item("soon2", { dueDate: d("2026-10-20") }),
          item("late", { dueDate: d("2026-10-12") }),
          item("soon1", { dueDate: d("2026-10-15") }),
          item("early", { dueDate: d("2026-10-01") }),
        ],
        now,
      );
      expect(out.map((o) => o.item.title)).toEqual(["early", "late", "soon1", "soon2"]);
    });
  });
});
