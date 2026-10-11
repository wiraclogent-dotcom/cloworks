import type { NextAuthConfig } from "next-auth";
import type { AppRole, JobRole } from "@prisma/client";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

declare module "next-auth" {
  interface Session {
    /**
     * Member sessions set id/appRole/jobRole. Applicant sessions set only `applicantId` (+ loginEmail): `id` and the
     * roles stay unset, so `requireUser()` rejects them.
     */
    user: { id: string; appRole: AppRole; jobRole: JobRole; loginEmail?: string; pwv?: number; applicantId?: string } & import("next-auth").DefaultSession["user"];
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    /** Applicant id for an applicant token (no uid/appRole/jobRole/pwv). */
    aid?: string;
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

export type RouteKind = "anonymous" | "applicant" | "member";

const PUBLIC_PATHS = ["/signin", "/signup"];
const APPLICANT_PATHS = ["/lobby", "/verify"];
const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");
const isJoin = (pathname: string) => pathname.startsWith("/join/");

/**
 * Pure edge routing: true = allow, false = send to sign-in, string = redirect there.
 * Public: "/", /signin, /signup, /join/**. An applicant may reach only /lobby, /verify, /join/** (and /signin, the
 * Auth.js error page); everything else sends them to /lobby. A member on /lobby or /verify goes to /requests, and on
 * "/" skips the landing page unless previewing. /verify is also open to anonymous visitors: sign-up with an email that
 * already has an account lands there without a session, so the screen must not depend on being signed in.
 */
export function routeDecision(pathname: string, kind: RouteKind, opts: { preview?: boolean } = {}): boolean | string {
  if (pathname === "/") {
    if (kind === "member") return opts.preview ? true : "/requests";
    return kind === "applicant" ? "/lobby" : true;
  }
  if (pathname === "/signin" || isJoin(pathname)) return true;
  if (kind === "applicant") return APPLICANT_PATHS.some((p) => under(pathname, p)) ? true : "/lobby";
  if (PUBLIC_PATHS.some((p) => pathname === p)) return true;
  if (under(pathname, "/verify")) return kind === "member" ? "/requests" : true;
  if (APPLICANT_PATHS.some((p) => under(pathname, p))) return kind === "member" ? "/requests" : false;
  return kind === "member";
}

/** Which kind of session the edge sees, from the session callback's output. */
function routeKind(user: { appRole?: unknown; applicantId?: unknown } | undefined): RouteKind {
  if (user?.appRole) return "member";
  return user?.applicantId ? "applicant" : "anonymous";
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
      const { pathname, searchParams } = request.nextUrl;
      const d = routeDecision(pathname, routeKind(auth?.user), { preview: searchParams.has("preview") });
      return typeof d === "string" ? Response.redirect(new URL(d, request.nextUrl)) : d;
    },
    session({ session, token }) {
      if (token.uid && token.appRole && token.jobRole) {
        session.user.id = token.uid;
        session.user.appRole = token.appRole;
        session.user.jobRole = token.jobRole;
        session.user.loginEmail = token.loginEmail;
        session.user.pwv = token.pwv;
      } else if (token.aid) {
        session.user.applicantId = token.aid;
        session.user.loginEmail = token.loginEmail;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
