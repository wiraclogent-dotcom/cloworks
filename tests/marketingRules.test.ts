import { describe, it, expect } from "vitest";
import { assertCanSaveActivity, canEditDivision, canManageMonth } from "@/lib/marketing/rules";
import { MarketingError } from "@/lib/marketing/errors";

const admin = { id: "a", appRole: "ADMIN" as const };
const kolLead = { id: "k", appRole: "REQUESTER" as const };
const lead = { id: "l", appRole: "LEAD" as const };

const caught = (fn: () => void) => { try { fn(); } catch (e) { return e as MarketingError; } throw new Error("did not throw"); };

describe("marketing calendar permissions", () => {
  it("an admin edits every division", () => expect(canEditDivision(admin, "kol", [])).toBe(true));
  it("a requester who leads KOL edits KOL", () => expect(canEditDivision(kolLead, "kol", ["kol"])).toBe(true));
  it("a KOL lead cannot edit Digital Ads", () => expect(canEditDivision(kolLead, "ads", ["kol"])).toBe(false));
  it("appRole LEAD alone grants nothing", () => expect(canEditDivision(lead, "kol", [])).toBe(false));
  it("only admins manage the month", () => {
    expect(canManageMonth(admin)).toBe(true);
    expect(canManageMonth(lead)).toBe(false);
  });

  it("moving an activity needs both divisions", () => {
    const e = caught(() => assertCanSaveActivity(kolLead, ["kol"], ["kol", "ads"], "kol", "ads"));
    expect(e).toBeInstanceOf(MarketingError);
    expect(e.code).toBe("FORBIDDEN");
    expect(e.message).toBe("You can only edit activities of divisions you lead.");
    expect(() => assertCanSaveActivity(kolLead, ["kol", "ads"], ["kol", "ads"], "kol", "ads")).not.toThrow();
  });

  it("a lead cannot edit an activity of another division in place", () => {
    expect(caught(() => assertCanSaveActivity(kolLead, ["kol"], ["kol", "ads"], "ads", "ads")).code).toBe("FORBIDDEN");
  });

  it("a division off the calendar takes no activities, even from an admin", () => {
    const e = caught(() => assertCanSaveActivity(admin, [], ["kol"], null, "creative"));
    expect(e.code).toBe("INVALID");
    expect(e.fieldErrors).toEqual({ divisionId: "This division is not on the Marketing Calendar." });
  });
});
