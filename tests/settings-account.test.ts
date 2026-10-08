import { describe, it, expect } from "vitest";
import { accountRows } from "@/lib/settings/account";

describe("accountRows", () => {
  it("lists the account fields with readable role labels", () => {
    expect(
      accountRows({ fullName: "Wira Budi", email: "wira@example.com", title: "Creative Director", department: "Creative", appRole: "LEAD", jobRole: "DESIGNER" }),
    ).toEqual([
      { label: "Full name", value: "Wira Budi" },
      { label: "Email", value: "wira@example.com" },
      { label: "Role", value: "Lead" },
      { label: "Job role", value: "Designer" },
      { label: "Department", value: "Creative" },
      { label: "Title", value: "Creative Director" },
    ]);
  });

  it("shows a dash for an empty optional field", () => {
    const rows = accountRows({ fullName: "A", email: null, title: null, department: null, appRole: "REQUESTER", jobRole: "OTHER" });
    expect(rows.find((r) => r.label === "Email")?.value).toBe("—");
    expect(rows.find((r) => r.label === "Title")?.value).toBe("—");
  });
});
