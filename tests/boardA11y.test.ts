import { describe, it, expect } from "vitest";
import { buildAnnouncements } from "@/lib/boardA11y";

const a = buildAnnouncements((id) => ({ "cmuz3o2t": "Poster" } as Record<string, string>)[String(id)]);
const active = { id: "cmuz3o2t" };

describe("board announcements", () => {
  it("uses titles and status labels, never ids or enum values", () => {
    const all = [
      a.onDragStart({ active }),
      a.onDragOver({ active, over: { id: "ON_PROGRESS" } }),
      a.onDragOver({ active, over: null }),
      a.onDragEnd({ active, over: { id: "FIRST_LOOK" } }),
      a.onDragEnd({ active, over: null }),
      a.onDragCancel({ active }),
    ];
    expect(all[0]).toBe("Picked up “Poster”. Press arrow keys to move between columns.");
    expect(all[1]).toBe("“Poster” is over On progress.");
    expect(all[3]).toBe("“Poster” moved to First look.");
    for (const m of all) { expect(m).not.toMatch(/cmuz3o2t|ON_PROGRESS|FIRST_LOOK|droppable|Draggable/); expect(m).toContain("“Poster”"); }
  });
  it("falls back to a neutral name for an unknown card", () => {
    expect(a.onDragStart({ active: { id: "zzz" } })).toContain("“Request”");
  });
});
