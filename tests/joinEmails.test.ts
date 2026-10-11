import { describe, it, expect } from "vitest";
import { codeEmail, inviteEmail, approvedEmail, alreadyHaveAccountEmail } from "@/lib/joinEmails";

describe("join emails", () => {
  it("codeEmail carries the code and expiry", () => {
    expect(codeEmail("482913").text).toContain("Your Cloworks code is 482913. It expires in 15 minutes.");
  });
  it("inviteEmail names inviter and workspace, with url, role and expiry", () => {
    const m = inviteEmail({ inviter: "Wira", workspace: "Clogent", role: "Designer", url: "https://x.test/join/t", expires: new Date("2026-10-18T00:00:00Z") });
    expect(m.subject).toBe("Wira invited you to join Clogent on Cloworks");
    expect(m.text).toContain("https://x.test/join/t");
    expect(m.text).toContain("Designer");
    expect(m.text).toContain("2026");
  });
  it("approvedEmail starts with the approval line and has the url", () => {
    const m = approvedEmail({ workspace: "Clogent", url: "https://x.test/signin" });
    expect(m.text.startsWith("You're in. Clogent approved your request.")).toBe(true);
    expect(m.text).toContain("https://x.test/signin");
  });
  it("alreadyHaveAccountEmail gives the sign-in url", () => {
    const m = alreadyHaveAccountEmail({ signinUrl: "https://x.test/signin" });
    expect(m.text).toContain("already have a Cloworks account");
    expect(m.text).toContain("https://x.test/signin");
    expect(m.text).toContain("ignore");
  });
});
