export type Mail = { subject: string; text: string };

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
    text: `${p.inviter} invited you to join ${p.workspace} on Cloworks as ${p.role}.\n\nAccept the invite: ${p.url}\n\nThis link expires on ${date}.`,
  };
}

/** Sent when a join request is approved. */
export function approvedEmail(p: { workspace: string; url: string }): Mail {
  return {
    subject: `You're in: ${p.workspace} approved your request`,
    text: `You're in. ${p.workspace} approved your request.\n\nSign in to get started: ${p.url}`,
  };
}

/** Sent instead of a code when someone signs up with an email that already has an account. */
export function alreadyHaveAccountEmail(p: { signinUrl: string }): Mail {
  return {
    subject: "You already have a Cloworks account",
    text: `You already have a Cloworks account. Sign in here: ${p.signinUrl}\n\nIf this wasn't you, you can ignore this email.`,
  };
}
