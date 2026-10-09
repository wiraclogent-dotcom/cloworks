"use server";

import { revalidatePath } from "next/cache";
import type { AppRole, JobRole } from "@prisma/client";
import { dbFor, requireUser } from "@/lib/session";
import { withUser } from "@/lib/actionUser";
import { addAllowedEmail, createUser, removeAllowedEmail, setUserLoginEmail, setUserPassword, updateUser } from "@/lib/admin";
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

export async function addPerson(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        await createUser(db, actor, {
          name: s(fd, "name"),
          fullName: s(fd, "fullName"),
          title: s(fd, "title"),
          department: s(fd, "department"),
          jobRole: s(fd, "jobRole") as JobRole,
          appRole: s(fd, "appRole") as AppRole,
          aliases: splitList(s(fd, "aliases")),
        });
        return "Person added. Set their login email so they can sign in.";
      }),
    );
  }, () => adminUnauth(fd));
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
