import { describe, it, expect } from "vitest";
import { waitlistEmail } from "@/lib/waitlistEmails";

const base = { email: "ana@team.co", team: "Acme", teamSize: "6–15", url: "https://clowork.my.id/admin/waitlist" };

describe("waitlistEmail", () => {
  it("has the subject, the details and the admin link", () => {
    const m = waitlistEmail(base);
    expect(m.subject).toBe("New waitlist signup: Acme");
    expect(m.text).toContain("Acme");
    expect(m.text).toContain("6–15");
    expect(m.text).toContain("ana@team.co");
    expect(m.html).toContain("https://clowork.my.id/admin/waitlist");
  });

  it("leaves the button out without a link but still lists the details", () => {
    const m = waitlistEmail({ ...base, url: "" });
    expect(m.html).not.toContain('href="/admin');
    expect(m.text).toContain("Acme");
    expect(m.text).toContain("6–15");
    expect(m.text).toContain("ana@team.co");
  });

  it("escapes the team name in html", () => {
    const m = waitlistEmail({ ...base, team: "<b>x</b>" });
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
