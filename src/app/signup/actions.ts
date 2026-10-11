"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { JoinError, signUp } from "@/lib/applicants";
import { failed, field, isJoinCode, type AuthFormState } from "@/lib/authForm";
import { joinDeps } from "@/lib/joinDeps";
import { safeNext } from "@/lib/joinTokens";

/**
 * Creates the applicant and emails a code, then signs them in and sends them to /verify (carrying the join link as
 * `next`). An email that already has an account gets the same /verify screen without a session (the owner was
 * emailed instead), so the form never reveals which emails exist.
 */
export async function signUpAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const name = field(fd, "name", { max: 200 });
  const email = field(fd, "email", { max: 320 });
  const password = field(fd, "password", { max: 1000, trim: false });
  const rawJoin = field(fd, "join", { max: 100 });
  const join = isJoinCode(rawJoin) ? rawJoin : undefined;
  const next = join ? `/join/${join}` : safeNext(field(fd, "next", { max: 300 }), "");
  const verifyUrl = next ? `/verify?next=${encodeURIComponent(next)}` : "/verify";

  let applicantId: string | null;
  try {
    ({ applicantId } = await signUp(await joinDeps(), { name, email, password, ...(join ? { joinCode: join } : {}) }));
  } catch (e) {
    if (e instanceof JoinError) return failed(e.code === "VALIDATION" ? e.message : "Something went wrong. Try again.", { name, email });
    throw e;
  }
  if (!applicantId) redirect(verifyUrl);
  try {
    await signIn("credentials", { email, password, redirectTo: verifyUrl });
  } catch (e) {
    // signIn's success path throws Next's redirect, which must propagate.
    if (e instanceof AuthError) return failed("Your account was created, but signing in failed. Sign in to continue.", { name, email });
    throw e;
  }
  return null;
}
