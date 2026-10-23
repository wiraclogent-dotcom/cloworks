import { describe, it, expect } from "vitest";
import { notesHref, parseNotesParams } from "@/lib/notes/params";
import { formatEdited, formatNoteTime } from "@/lib/notes/format";

describe("notes URL params", () => {
  it("falls back to All Notes for unknown or foreign views", () => {
    expect(parseNotesParams({ view: "f-gone" }, ["f1"]).view).toBe("all");
    expect(parseNotesParams({ view: "f1" }, ["f1"]).view).toBe("f1");
    expect(parseNotesParams({}, [])).toEqual({ view: "all", noteId: null, q: "", pane: null });
    expect(parseNotesParams({ view: "deleted", note: ["n1", "n2"], q: "  kpi ", pane: "x" }, [])).toEqual({ view: "deleted", noteId: "n1", q: "kpi", pane: null });
    expect(parseNotesParams({ pane: "folders", q: "x".repeat(150) }, []).pane).toBe("folders");
    expect(parseNotesParams({ q: "x".repeat(150) }, []).q).toHaveLength(100);
  });

  it("builds hrefs with only non-default params", () => {
    expect(notesHref({})).toBe("/notes");
    expect(notesHref({ view: "f1", noteId: "n1", q: "a b" })).toBe("/notes?view=f1&note=n1&q=a+b");
    expect(notesHref({ view: "all", pane: "folders" })).toBe("/notes?pane=folders");
    expect(notesHref({ view: "deleted", noteId: null, q: "" })).toBe("/notes?view=deleted");
  });
});

describe("note times", () => {
  it("formats list times in Jakarta", () => {
    const now = new Date("2026-10-23T05:00:00Z"); // 12:00 WIB, Friday
    expect(formatNoteTime(new Date("2026-10-23T02:41:00Z"), now)).toBe("09:41");
    expect(formatNoteTime(new Date("2026-10-19T02:00:00Z"), now)).toBe("Mon");
    expect(formatNoteTime(new Date("2026-10-17T02:00:00Z"), now)).toBe("Sat");
    expect(formatNoteTime(new Date("2026-10-16T02:00:00Z"), now)).toBe("16 Oct 2026");
    expect(formatNoteTime(new Date("2026-10-12T02:00:00Z"), now)).toBe("12 Oct 2026");
    expect(formatNoteTime(new Date("2026-10-22T17:30:00Z"), now)).toBe("00:30"); // already the 23rd in Jakarta
    expect(formatEdited(new Date("2026-10-23T02:41:00Z"))).toBe("23 Oct 2026, 09:41");
  });
});
