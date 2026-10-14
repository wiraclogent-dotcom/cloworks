import { describe, it, expect } from "vitest";
import { ASSIGNEE_ORDER, assigneeLabel } from "@/lib/assignees";

describe("assigneeLabel", () => {
  it("is empty for nobody", () => expect(assigneeLabel([])).toBe(""));
  it("is the name for one person", () => expect(assigneeLabel(["Fafa"])).toBe("Fafa"));
  it("joins two names with an ampersand", () => expect(assigneeLabel(["Fafa", "Dimas"])).toBe("Fafa & Dimas"));
  it("counts three or more", () => {
    expect(assigneeLabel(["a", "b", "c"])).toBe("3 people");
    expect(assigneeLabel(["a", "b", "c", "d"])).toBe("4 people");
  });
});

describe("ASSIGNEE_ORDER", () => {
  it("orders by addedAt then userId", () => {
    expect(ASSIGNEE_ORDER).toEqual([{ addedAt: "asc" }, { userId: "asc" }]);
  });
});
