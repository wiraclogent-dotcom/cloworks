import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { codeEmail, inviteEmail, approvedEmail, alreadyHaveAccountEmail, resetEmail } from "@/lib/joinEmails";

const prev = process.env.APP_BASE_URL;
beforeEach(() => {
  process.env.APP_BASE_URL = "https://clowork.my.id";
});
afterEach(() => {
  if (prev === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = prev;
});

const expires = new Date("2026-11-01T00:00:00Z");

describe("join emails", () => {
  it("codeEmail: code is one unbroken token in html and text, no button", () => {
    const m = codeEmail("482913");
    expect(m.subject).toBe("Your Clowork code: 482913");
    expect(m.html).toContain("482913");
    expect(m.text).toContain("482913");
    expect(m.html).toContain("Your sign-up code");
    expect(m.text).toContain("Enter this code to finish signing up. It expires in 15 minutes.");
    expect(m.text).toContain("Didn't ask for it? Ignore this email.");
    expect(m.html).not.toContain("href=");
  });

  it("inviteEmail: heading, line, button and note", () => {
    const m = inviteEmail({ inviter: "Lia", workspace: "Clogent", role: "Designer", url: "https://clowork.my.id/join/abc", expires });
    expect(m.subject).toBe("Lia invited you to join Clogent on Clowork");
    expect(m.html).toContain("Join Clogent on Clowork");
    expect(m.text).toContain("Lia invited you to join Clogent as Designer.");
    expect(m.text).toContain("Accept invite: https://clowork.my.id/join/abc");
    expect(m.html).toContain('href="https://clowork.my.id/join/abc"');
    expect(m.text).toContain("This invite expires on 1 November 2026.");
  });

  it("inviteEmail without a link asks the inviter and has no button", () => {
    const m = inviteEmail({ inviter: "Lia", workspace: "Clogent", role: "Designer", url: "/join/abc", expires });
    expect(m.text).toContain("Ask Lia for the invite link.");
    expect(m.html).not.toContain("href=");
    expect(m.text).not.toContain("/join/");
  });

  it("approvedEmail: heading, line and Sign in button", () => {
    const m = approvedEmail({ workspace: "Clogent", url: "https://clowork.my.id/signin" });
    expect(m.subject).toBe("You're in: Clogent approved your request");
    expect(m.html).toContain("You&#39;re in");
    expect(m.text).toContain("You're in");
    expect(m.text).toContain("Clogent approved your request to join.");
    expect(m.text).toContain("Sign in: https://clowork.my.id/signin");
    expect(m.html).toContain('href="https://clowork.my.id/signin"');
  });

  it("approvedEmail without a link adds the sign-in line", () => {
    const m = approvedEmail({ workspace: "Clogent", url: "" });
    expect(m.text).toContain("Sign in to Clowork to get started.");
    expect(m.html).not.toContain("href=");
  });

  it("alreadyHaveAccountEmail: heading, line, button and note", () => {
    const m = alreadyHaveAccountEmail({ signinUrl: "https://clowork.my.id/signin" });
    expect(m.subject).toBe("You already have a Clowork account");
    expect(m.text).toContain("You already have an account");
    expect(m.text).toContain("This email already has a Clowork account.");
    expect(m.text).toContain("Sign in: https://clowork.my.id/signin");
    expect(m.text).toContain("Can't sign in? Contact your admin. Not you? Ignore this email.");
  });

  it("alreadyHaveAccountEmail without a link adds the sign-in line", () => {
    const m = alreadyHaveAccountEmail({ signinUrl: "" });
    expect(m.text).toContain("Sign in to Clowork with this email.");
    expect(m.html).not.toContain("href=");
  });

  it("resetEmail: heading, line, button and note", () => {
    const m = resetEmail({ url: "https://clowork.my.id/reset/t" });
    expect(m.subject).toBe("Reset your Clowork password");
    expect(m.text).toContain("Reset your password");
    expect(m.text).toContain("Someone asked to reset the password for this email. The link works for one hour.");
    expect(m.text).toContain("Set new password: https://clowork.my.id/reset/t");
    expect(m.text).toContain("Didn't ask for this? Ignore this email. Your password stays the same.");
  });

  it("resetEmail without a link says so and has no button", () => {
    const m = resetEmail({ url: "" });
    expect(m.text).toContain("The reset link could not be created. Ask your admin for help.");
    expect(m.text).not.toContain("The link works for one hour");
    expect(m.html).not.toContain("href=");
    expect(m.html).toContain('src="https://clowork.my.id/email/logo.png"');
    expect(m.text).toContain("clowork.my.id");
  });

  it("without a trusted absolute url no email carries a bare link", () => {
    for (const url of ["", "/signin", "/join/invite/t"]) {
      const mails = [
        inviteEmail({ inviter: "Wira", workspace: "Clogent", role: "Designer", url, expires }),
        approvedEmail({ workspace: "Clogent", url }),
        alreadyHaveAccountEmail({ signinUrl: url }),
        resetEmail({ url }),
        codeEmail("482913"),
      ];
      for (const m of mails) {
        expect(m.text).not.toContain("/signin");
        expect(m.text).not.toContain("/join/");
        expect(m.text).not.toContain("http");
        expect(m.html).not.toContain("href=");
      }
    }
  });
});
