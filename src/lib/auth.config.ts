import type { NextAuthConfig } from "next-auth";
import type { AppRole, JobRole } from "@prisma/client";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

declare module "next-auth" {
  interface Session {
    user: { id: string; appRole: AppRole; jobRole: JobRole; loginEmail?: string } & import("next-auth").DefaultSession["user"];
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    /** Normalised email this token was issued for; a rebound/cleared email invalidates it. */
    loginEmail?: string;
    appRole?: AppRole;
    jobRole?: JobRole;
  }
}

/** Edge/DB-free part of the config, shared with proxy.ts. Env: AUTH_GOOGLE_ID/SECRET, AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER. */
export const authConfig = {
  providers: [Google, MicrosoftEntraID],
  pages: { signIn: "/signin", error: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    // Edge role comes from the cookie token and may be stale up to 24h; requireUser() is the authoritative gate.
    authorized({ auth, request }) {
      if (request.nextUrl.pathname === "/signin") return true;
      return !!auth?.user?.appRole;
    },
    session({ session, token }) {
      if (token.uid && token.appRole && token.jobRole) {
        session.user.id = token.uid;
        session.user.appRole = token.appRole;
        session.user.jobRole = token.jobRole;
        session.user.loginEmail = token.loginEmail;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
