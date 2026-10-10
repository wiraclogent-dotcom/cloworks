import { describe, it, expect } from "vitest";
import { can, type Action } from "@/lib/permissions";

const ACTIONS: Action[] = [
  "request.create",
  "request.assign",
  "request.transition",
  "dashboard.team",
  "dashboard.teamView",
  "dashboard.self",
  "briefs.view",
  "project.manage",
  "admin.manage",
  "library.manage",
];

const EXPECTED = {
  REQUESTER: ["request.create", "dashboard.self", "dashboard.teamView", "briefs.view"],
  CREATIVE: ["request.create", "request.transition", "dashboard.self", "dashboard.teamView", "briefs.view", "project.manage"],
  LEAD: [
    "request.create",
    "dashboard.teamView",
    "briefs.view",
    "request.transition",
    "dashboard.self",
    "project.manage",
    "request.assign",
    "dashboard.team",
    "library.manage",
  ],
  ADMIN: ACTIONS,
} as const;

describe("can(role, action)", () => {
  for (const [role, allowed] of Object.entries(EXPECTED)) {
    for (const action of ACTIONS) {
      const want = (allowed as readonly string[]).includes(action);
      it(`${role} ${want ? "can" : "cannot"} ${action}`, () => {
        expect(can(role as keyof typeof EXPECTED, action)).toBe(want);
      });
    }
  }

  it("REQUESTER can see own dashboard (social media staff have targets)", () => {
    expect(can("REQUESTER", "dashboard.self")).toBe(true);
  });

  it("REQUESTER cannot see team dashboard", () => {
    expect(can("REQUESTER", "dashboard.team")).toBe(false);
  });
});
