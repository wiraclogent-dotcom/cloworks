export type Mail = { subject: string; text: string };

/**
 * Only absolute http(s) links go into an email. An empty or relative url (no trusted base URL is configured, e.g.
 * production without APP_BASE_URL) means the link sentence is left out rather than sending a bare "/signin".
 */
const linkOf = (url: string | undefined): string | null => (url && /^https?:\/\/[^\s]+$/.test(url) ? url : null);

/** Sign-up verification code. */
export function codeEmail(code: string): Mail {
  return {
    subject: `Your Cloworks code: ${code}`,
    text: `Your Cloworks code is ${code}. It expires in 15 minutes.\n\nIf you didn't ask for it, you can ignore this email.`,
  };
}

/** Workspace invite with link, role and expiry date. */
export function inviteEmail(p: { inviter: string; workspace: string; role: string; url: string; expires: Date }): Mail {
  const date = p.expires.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return {
    subject: `${p.inviter} invited you to join ${p.workspace} on Cloworks`,
    text: linkOf(p.url)
      ? `${p.inviter} invited you to join ${p.workspace} on Cloworks as ${p.role}.\n\nAccept the invite: ${linkOf(p.url)}\n\nThis link expires on ${date}.`
      : `${p.inviter} invited you to join ${p.workspace} on Cloworks as ${p.role}.\n\nAsk ${p.inviter} for the invite link. The invite expires on ${date}.`,
  };
}

/** Sent when a join request is approved. */
export function approvedEmail(p: { workspace: string; url: string }): Mail {
  return {
    subject: `You're in: ${p.workspace} approved your request`,
    text: linkOf(p.url)
      ? `You're in. ${p.workspace} approved your request.\n\nSign in to get started: ${linkOf(p.url)}`
      : `You're in. ${p.workspace} approved your request.\n\nSign in to Cloworks to get started.`,
  };
}

/**
 * Sent instead of a code when someone signs up with an email that already has an account (active or deactivated: the
 * copy covers both without saying which).
 */
export function alreadyHaveAccountEmail(p: { signinUrl: string }): Mail {
  const tail = "If you can't sign in, contact your admin.\n\nIf this wasn't you, you can ignore this email.";
  return {
    subject: "You already have a Cloworks account",
    text: linkOf(p.signinUrl)
      ? `You already have a Cloworks account. Sign in here: ${linkOf(p.signinUrl)}\n\n${tail}`
      : `You already have a Cloworks account. Sign in to Cloworks with this email.\n\n${tail}`,
  };
}
