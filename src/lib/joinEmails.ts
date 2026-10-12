import { renderEmail } from "@/lib/emailLayout";

export type Mail = { subject: string; text: string; html: string };

/**
 * Only absolute http(s) links go into an email. An empty or relative url (no trusted base URL is configured, e.g.
 * production without APP_BASE_URL) means the button is left out rather than sending a bare "/signin".
 */
const linkOf = (url: string | undefined): string | null => (url && /^https?:\/\/[^\s]+$/.test(url) ? url : null);

/** Sign-up verification code. */
export function codeEmail(code: string): Mail {
  return {
    subject: `Your Cloworks code: ${code}`,
    ...renderEmail({
      preheader: "Your code expires in 15 minutes",
      heading: "Your sign-up code",
      lines: ["Enter this code to finish signing up. It expires in 15 minutes."],
      code,
      note: "Didn't ask for it? Ignore this email.",
    }),
  };
}

/** Workspace invite with link, role and expiry date. */
export function inviteEmail(p: { inviter: string; workspace: string; role: string; url: string; expires: Date }): Mail {
  const date = p.expires.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const link = linkOf(p.url);
  const lines = [`${p.inviter} invited you to join ${p.workspace} as ${p.role}.`];
  if (!link) lines.push(`Ask ${p.inviter} for the invite link.`);
  return {
    subject: `${p.inviter} invited you to join ${p.workspace} on Cloworks`,
    ...renderEmail({
      preheader: `${p.inviter} invited you to ${p.workspace}`,
      heading: `Join ${p.workspace} on Cloworks`,
      lines,
      button: link ? { label: "Accept invite", url: link } : undefined,
      note: `This invite expires on ${date}.`,
    }),
  };
}

/** Sent when a join request is approved. */
export function approvedEmail(p: { workspace: string; url: string }): Mail {
  const link = linkOf(p.url);
  const lines = [`${p.workspace} approved your request to join.`];
  if (!link) lines.push("Sign in to Cloworks to get started.");
  return {
    subject: `You're in: ${p.workspace} approved your request`,
    ...renderEmail({
      preheader: `${p.workspace} approved your request`,
      heading: "You're in",
      lines,
      button: link ? { label: "Sign in", url: link } : undefined,
    }),
  };
}

/**
 * Sent instead of a code when someone signs up with an email that already has an account (active or deactivated: the
 * copy covers both without saying which).
 */
export function alreadyHaveAccountEmail(p: { signinUrl: string }): Mail {
  const link = linkOf(p.signinUrl);
  const lines = ["This email already has a Cloworks account."];
  if (!link) lines.push("Sign in to Cloworks with this email.");
  return {
    subject: "You already have a Cloworks account",
    ...renderEmail({
      preheader: "Sign in with your existing account",
      heading: "You already have an account",
      lines,
      button: link ? { label: "Sign in", url: link } : undefined,
      note: "Can't sign in? Contact your admin. Not you? Ignore this email.",
    }),
  };
}

/** Password reset link, valid for one hour. */
export function resetEmail(p: { url: string }): Mail {
  const link = linkOf(p.url);
  return {
    subject: "Reset your Cloworks password",
    ...renderEmail({
      preheader: "The link works for one hour",
      heading: "Reset your password",
      lines: [
        link
          ? "Someone asked to reset the password for this email. The link works for one hour."
          : "The reset link could not be created. Ask your admin for help.",
      ],
      button: link ? { label: "Set new password", url: link } : undefined,
      note: "Didn't ask for this? Ignore this email. Your password stays the same.",
    }),
  };
}
