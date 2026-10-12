"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AppRole, JobRole } from "@prisma/client";
import { dbFor, requireUser } from "@/lib/session";
import { UNAUTH_MESSAGE, withUser } from "@/lib/actionUser";
import { AdminError, createUser, normalizeEmail, setUserLoginEmail, setUserPassword, updateUser } from "@/lib/admin";
import { mergePreview, mergeUsers } from "@/lib/mergeUsers";
import { createInvite, resendInvite, revokeInvite } from "@/lib/invites";
import { approveFor, rejectFor, requestBaseUrl, resetLinkFor, setLinkEnabledFor, undoRejectFor } from "@/lib/joinDeps";
import { createMailerFromEnv } from "@/lib/mailer";
import { checkNewPassword } from "@/lib/password";
import { adminResult, adminUnauth, splitList, type AdminFormState, type MergeFormState } from "@/lib/adminForm";

const s = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const done = (r: NonNullable<AdminFormState>) => {
  if (r.ok) revalidatePath("/admin/users");
  return r;
};

/** Every action takes identity from the session only; the cores re-check `admin.manage`. */
export async function saveUser(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        await updateUser(db, actor, s(fd, "userId"), {
          appRole: s(fd, "appRole") as AppRole,
          jobRole: s(fd, "jobRole") as JobRole,
          aliases: splitList(s(fd, "aliases")),
          fullName: s(fd, "fullName"),
          title: s(fd, "title") || null,
        });
        return "Saved.";
      }),
    );
  }, () => adminUnauth(fd));
}

export async function setUserActive(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    const active = s(fd, "active") === "true";
    return done(
      await adminResult(fd, async () => {
        await updateUser(db, actor, s(fd, "userId"), { active });
        return active ? "Reactivated." : "Deactivated. History is kept.";
      }),
    );
  }, () => adminUnauth(fd));
}

export async function saveLoginEmail(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        const email = s(fd, "email").trim();
        await setUserLoginEmail(db, actor, s(fd, "userId"), email === "" ? null : email);
        return email === "" ? "Login email cleared; access ends on their next request." : "Login email saved.";
      }),
    );
  }, () => adminUnauth(fd));
}

/** Sets or resets a password. The typed password is never echoed back in the form state. */
export async function savePassword(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const scrub = (r: NonNullable<AdminFormState>) => ({ ...r, values: { ...r.values, password: "" } });
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return scrub(
      done(
        await adminResult(fd, async () => {
          await setUserPassword(db, actor, s(fd, "userId"), s(fd, "password"));
          return "Password saved. Share it with them privately; any open sessions of theirs have ended.";
        }),
      ),
    );
  }, () => scrub(adminUnauth(fd)));
}

/**
 * Adds a person, optionally with a login email and a temporary password (which they must change at first sign-in).
 * The email (format and not already someone's login in this workspace) and the password are validated before anything
 * is created; a concurrent claim of the same email can still fail later. The typed password is never echoed back.
 * Create, email and password are separate steps: if a later one fails the person already exists, and the message says
 * so; the admin finishes with that row's login email and password forms.
 */
export async function addPerson(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const scrub = (r: NonNullable<AdminFormState>) => ({ ...r, values: { ...r.values, password: "" } });
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return scrub(
      done(
        await adminResult(fd, async () => {
          const rawEmail = s(fd, "email").trim();
          const email = rawEmail === "" ? "" : normalizeEmail(rawEmail);
          const password = s(fd, "password");
          if (email !== "" && (await db.user.findFirst({ where: { email }, select: { id: true } }))) {
            throw new AdminError("CONFLICT", "That email is already used as a login by someone else.");
          }
          if (password !== "") {
            if (email === "") throw new AdminError("VALIDATION", "Add a login email to give them a password.");
            const problem = checkNewPassword(password);
            if (problem) throw new AdminError("VALIDATION", problem);
          }
          const person = await createUser(db, actor, {
            name: s(fd, "name"),
            fullName: s(fd, "fullName"),
            title: s(fd, "title"),
            department: s(fd, "department"),
            jobRole: s(fd, "jobRole") as JobRole,
            appRole: s(fd, "appRole") as AppRole,
            aliases: splitList(s(fd, "aliases")),
          });
          if (email === "") return "Person added. Set their login email so they can sign in.";
          try {
            await setUserLoginEmail(db, actor, person.id, email);
            if (password !== "") await setUserPassword(db, actor, person.id, password);
          } catch (e) {
            if (e instanceof AdminError) {
              throw new AdminError(e.code, `${person.name} was added, but ${e.message.charAt(0).toLowerCase()}${e.message.slice(1)}${/[.!?]$/.test(e.message) ? "" : "."} Finish with Edit in their row.`, e.details);
            }
            throw e;
          }
          return password !== ""
            ? "Person added. Share the temporary password with them privately; they choose their own at first sign-in."
            : "Person added with a login email. Set a password so they can sign in.";
        }),
      ),
    );
  }, () => scrub(adminUnauth(fd)));
}

// Members: invites (workspace-scoped) and join requests / the join link (global tables, through joinDeps).

const inviteDeps = async () => ({ mailer: createMailerFromEnv(), baseUrl: await requestBaseUrl() });

export async function inviteMember(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        const { mailer, baseUrl } = await inviteDeps();
        const email = s(fd, "email").trim();
        await createInvite(db, actor, mailer, { email, appRole: s(fd, "appRole") as AppRole, jobRole: s(fd, "jobRole") as JobRole, userId: s(fd, "userId") || undefined }, baseUrl);
        return `Invite sent to ${normalizeEmail(email)}.`;
      }),
    );
  }, () => adminUnauth(fd));
}

export async function resendMemberInvite(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        const { mailer, baseUrl } = await inviteDeps();
        await resendInvite(db, actor, mailer, s(fd, "inviteId"), baseUrl);
        return "Invite sent again with a new link.";
      }),
    );
  }, () => adminUnauth(fd));
}

export async function revokeMemberInvite(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        await revokeInvite(db, actor, s(fd, "inviteId"));
        return "Invite revoked. Its link no longer works.";
      }),
    );
  }, () => adminUnauth(fd));
}

export async function approveRequest(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    return done(
      await adminResult(fd, async () => {
        const { mailer, baseUrl } = await inviteDeps();
        const r = await approveFor(actor, mailer, s(fd, "applicantId"), { appRole: s(fd, "appRole") as AppRole, jobRole: s(fd, "jobRole") as JobRole }, baseUrl, s(fd, "linkUserId") || undefined);
        return r.linked ? `Approved as ${r.name}. They sign in once more to continue.` : "Approved. They can sign in now.";
      }),
    );
  }, () => adminUnauth(fd));
}

export async function rejectRequest(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    return done(await adminResult(fd, async () => { await rejectFor(actor, s(fd, "applicantId")); return "Request rejected."; }));
  }, () => adminUnauth(fd));
}

export async function undoRejectRequest(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    return done(await adminResult(fd, async () => { await undoRejectFor(actor, s(fd, "applicantId")); return "Back in requests."; }));
  }, () => adminUnauth(fd));
}

export async function resetInviteLink(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    return done(await adminResult(fd, async () => { await resetLinkFor(actor); return "New link created. The old one no longer works."; }));
  }, () => adminUnauth(fd));
}

export async function toggleInviteLink(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const enabled = s(fd, "enabled") === "true";
    return done(await adminResult(fd, async () => { await setLinkEnabledFor(actor, enabled); return enabled ? "Join link turned on." : "Join link turned off."; }));
  }, () => adminUnauth(fd));
}

/** Merge step 1: what merging `fromId` into `intoId` would move. Writes nothing; failures are data for the form. */
export async function previewMerge(_prev: MergeFormState, fd: FormData): Promise<MergeFormState> {
  return withUser<NonNullable<MergeFormState>, NonNullable<MergeFormState>>(requireUser, async (actor) => {
    try {
      return { ok: true, preview: await mergePreview(dbFor(actor), actor, s(fd, "fromId"), s(fd, "intoId")) };
    } catch (e) {
      if (e instanceof AdminError) return { ok: false, error: e.message };
      throw e;
    }
  }, () => ({ ok: false, error: UNAUTH_MESSAGE }));
}

/** Merge step 2: moves the duplicate's history onto the survivor and removes the duplicate. */
export async function mergePerson(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  let survivor: string | null = null;
  const result = await withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        const { intoName } = await mergeUsers(db, actor, s(fd, "fromId"), s(fd, "intoId"));
        survivor = intoName;
        return `Merged into ${intoName}.`;
      }),
    );
  }, () => adminUnauth(fd));
  // The duplicate's row is gone, so its own success message would never be seen: show it on the page instead.
  if (survivor !== null) redirect(`/admin/users?merged=${encodeURIComponent(survivor)}`);
  return result;
}
