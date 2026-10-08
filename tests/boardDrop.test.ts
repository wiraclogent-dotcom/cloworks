import { describe, it, expect } from "vitest";
import type { RequestStatus } from "@prisma/client";
import { decideDrop } from "@/lib/boardDrop";
import { canTransition } from "@/lib/workflow";

const ALL: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE", "CANCELLED"];

describe("decideDrop", () => {
  it("is a noop for everyone without move rights, whatever the target", () => {
    for (const from of ALL) for (const to of ALL) for (const hasAssignee of [true, false])
      expect(decideDrop({ from, to, hasAssignee, canMove: false })).toEqual({ kind: "noop" });
  });

  it("is a noop when dropped back on the same column", () => {
    for (const s of ALL) for (const hasAssignee of [true, false])
      expect(decideDrop({ from: s, to: s, hasAssignee, canMove: true })).toEqual({ kind: "noop" });
  });

  it("exhaustive table for every from/to/assignee combination", () => {
    for (const from of ALL) for (const to of ALL) for (const hasAssignee of [true, false]) {
      if (from === to) continue;
      const got = decideDrop({ from, to, hasAssignee, canMove: true }).kind;
      let want: string;
      if (!canTransition(from, to)) want = "illegal";
      else if (to === "DONE") want = hasAssignee ? "needs-done-details" : "needs-assignee";
      else want = "move";
      expect(got, `${from}->${to} assignee=${hasAssignee}`).toBe(want);
    }
  });

  it("spot checks the named cases", () => {
    expect(decideDrop({ from: "REQUESTED", to: "DONE", hasAssignee: true, canMove: true }).kind).toBe("illegal");
    expect(decideDrop({ from: "REQUESTED", to: "DONE", hasAssignee: false, canMove: true }).kind).toBe("illegal");
    expect(decideDrop({ from: "FIRST_LOOK", to: "DONE", hasAssignee: false, canMove: true }).kind).toBe("needs-assignee");
    expect(decideDrop({ from: "FIRST_LOOK", to: "DONE", hasAssignee: true, canMove: true }).kind).toBe("needs-done-details");
    expect(decideDrop({ from: "REQUESTED", to: "ON_PROGRESS", hasAssignee: false, canMove: true }).kind).toBe("move");
    expect(decideDrop({ from: "DONE", to: "ON_PROGRESS", hasAssignee: true, canMove: true }).kind).toBe("move");
    expect(decideDrop({ from: "CANCELLED", to: "REQUESTED", hasAssignee: true, canMove: true }).kind).toBe("illegal");
  });
});
