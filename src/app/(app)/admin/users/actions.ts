"use server";

import { revalidatePath } from "next/cache";
import type { AppRole, JobRole } from "@prisma/client";
import { dbFor, requireUser } from "@/lib/session";
import { withUser } from "@/lib/actionUser";
import { AdminError, addAllowedEmail, createUser, normalizeEmail, removeAllowedEmail, setUserLoginEmail, setUserPassword, updateUser } from "@/lib/admin";
import { checkNewPassword } from "@/lib/password";
import { adminResult, adminUnauth, splitList, type AdminFormState } from "@/lib/adminForm";

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

export async function addAllowed(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        await addAllowedEmail(db, actor, s(fd, "email"), s(fd, "note"));
        return "Email allowed.";
      }),
    );
  }, () => adminUnauth(fd));
}

export async function removeAllowed(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        await removeAllowedEmail(db, actor, s(fd, "email"));
        return "Removed. Anyone relying on it loses access on their next request.";
      }),
    );
  }, () => adminUnauth(fd));
}
