"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

/** Email + password sign-in. A refused attempt comes back to /signin with a fixed error code, never the input. */
export async function passwordSignIn(fd: FormData) {
  const email = typeof fd.get("email") === "string" ? (fd.get("email") as string) : "";
  const password = typeof fd.get("password") === "string" ? (fd.get("password") as string) : "";
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (e) {
    // signIn's success path throws Next's redirect, which must propagate; only Auth.js failures are mapped.
    if (e instanceof AuthError) redirect(`/signin?error=${e.type === "CredentialsSignin" ? "CredentialsSignin" : "Default"}`);
    throw e;
  }
}
