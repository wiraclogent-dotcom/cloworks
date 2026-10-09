import type { NextAuthConfig } from "next-auth";
import type { AppRole, JobRole } from "@prisma/client";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

declare module "next-auth" {
  interface Session {
    user: { id: string; appRole: AppRole; jobRole: JobRole; loginEmail?: string; pwv?: number } & import("next-auth").DefaultSession["user"];
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    /** Normalised email this token was issued for; a rebound/cleared email invalidates it. */
    loginEmail?: string;
    /** User.passwordVersion when issued; a password change invalidates older tokens. */
    pwv?: number;
    appRole?: AppRole;
    jobRole?: JobRole;
  }
}

/** OAuth providers whose credentials are configured; each is optional now that email + password sign-in exists. */
export function oauthProviderIds(env: Record<string, string | undefined> = process.env): ("google" | "microsoft-entra-id")[] {
  const ids: ("google" | "microsoft-entra-id")[] = [];
  if (env.AUTH_GOOGLE_ID?.trim()) ids.push("google");
  if (env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim()) ids.push("microsoft-entra-id");
  return ids;
}

/**
 * Edge/DB-free part of the config, shared with proxy.ts. Env: AUTH_GOOGLE_ID/SECRET, AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER.
 * The password (Credentials) provider needs the database, so auth.ts adds it.
 */
export const authConfig = {
  providers: oauthProviderIds().map((id) => (id === "google" ? Google : MicrosoftEntraID)),
  pages: { signIn: "/signin", error: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    // Edge role comes from the cookie token and may be stale up to 24h; requireUser() is the authoritative gate.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/signin") return true;
      // "/" is the public landing page; signed-in people skip it and land on the board unless they ask for `/?preview`.
      if (pathname === "/") {
        const skip = auth?.user?.appRole && !request.nextUrl.searchParams.has("preview");
        return skip ? Response.redirect(new URL("/requests", request.nextUrl)) : true;
      }
      return !!auth?.user?.appRole;
    },
    session({ session, token }) {
      if (token.uid && token.appRole && token.jobRole) {
        session.user.id = token.uid;
        session.user.appRole = token.appRole;
        session.user.jobRole = token.jobRole;
        session.user.loginEmail = token.loginEmail;
        session.user.pwv = token.pwv;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
