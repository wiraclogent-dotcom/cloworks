import { renderEmail } from "@/lib/emailLayout";
import type { Mail } from "@/lib/joinEmails";
import { cleanLine } from "@/lib/notify";

/** Told to the platform admins when a team joins the waitlist. Only an absolute http(s) url gets a button. */
export function waitlistEmail(p: { email: string; team: string; teamSize: string; url: string }): Mail {
  const team = cleanLine(p.team, 120);
  const link = /^https?:\/\/[^\s]+$/.test(p.url) ? p.url : null;
  return {
    subject: `New waitlist signup: ${team}`,
    ...renderEmail({
      preheader: `${team} joined the waitlist`,
      heading: "New waitlist signup",
      lines: [`Team: ${team}`, `Size: ${p.teamSize}`, `Email: ${cleanLine(p.email, 320)}`],
      button: link ? { label: "Open waitlist", url: link } : undefined,
    }),
  };
}
