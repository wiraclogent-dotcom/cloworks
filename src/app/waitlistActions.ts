"use server";

import { after } from "next/server";
import type { AuthFormState } from "@/lib/authForm";
// eslint-disable-next-line no-restricted-imports -- WaitlistEntry is global (no workspace); a public visitor has no scope
import { prisma } from "@/lib/db";
import { requestBaseUrl } from "@/lib/joinDeps";
import { bestEffort, realMailer } from "@/lib/notify";
import { platformAdminEmails } from "@/lib/platformAdmin";
import { joinWaitlistWith, WAITLIST_SIZES, type NewWaitlistEntry } from "@/lib/waitlist";
import { waitlistEmail } from "@/lib/waitlistEmails";

/** Public sign-up from the landing page. Emails the platform admins, never the address typed into the form. */
export async function joinWaitlist(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const baseUrl = await requestBaseUrl();
  const notify = (e: NewWaitlistEntry) => {
    const admins = platformAdminEmails();
    if (admins.length === 0) return;
    const mail = waitlistEmail({
      email: e.email,
      team: e.team,
      teamSize: WAITLIST_SIZES.find((s) => s.value === e.teamSize)?.label ?? e.teamSize,
      url: baseUrl ? `${baseUrl}/admin/waitlist` : "",
    });
    const run = () => Promise.all(admins.map((to) => bestEffort(() => realMailer().send({ to, ...mail }))));
    try {
      after(run);
    } catch {
      void run(); // outside a request (scripts, tests) there is no after(): send right away
    }
  };
  return joinWaitlistWith({ db: prisma, notify }, fd);
}
