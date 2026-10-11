"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { field, rememberOf } from "@/lib/authForm";
import { safeNext } from "@/lib/joinTokens";

/**
 * Email + password sign-in, then to `next` when it is a join or lobby path, else /requests. A refused attempt comes
 * back to /signin with a fixed error code (and the sanitised next), never the input.
 */
export async function passwordSignIn(fd: FormData) {
  const email = typeof fd.get("email") === "string" ? (fd.get("email") as string) : "";
  const password = typeof fd.get("password") === "string" ? (fd.get("password") as string) : "";
  const next = safeNext(field(fd, "next"), "/requests");
  try {
    await signIn("credentials", { email, password, ...rememberOf(fd), redirectTo: next });
  } catch (e) {
    // signIn's success path throws Next's redirect, which must propagate; only Auth.js failures are mapped.
    if (e instanceof AuthError) {
      const keep = next === "/requests" ? "" : `&next=${encodeURIComponent(next)}`;
      redirect(`/signin?error=${e.type === "CredentialsSignin" ? "CredentialsSignin" : "Default"}${keep}`);
    }
    throw e;
  }
}

/** "Continue with Google", returning to a sanitised `next` (join or lobby path) or /requests. */
export async function googleSignIn(fd: FormData) {
  await signIn("google", { redirectTo: safeNext(field(fd, "next"), "/requests") });
}
