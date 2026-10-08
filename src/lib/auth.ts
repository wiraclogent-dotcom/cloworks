import NextAuth from "next-auth";
import type { AppRole, JobRole } from "@prisma/client";
import { authConfig } from "./auth.config";
import { prisma } from "./db";
import { DEFAULT_ALLOWED_DOMAIN, decideSignIn, resolveSignIn } from "./signin";
import { refreshJwt } from "./session-core";

export { isAllowedEmail } from "./signin";

declare module "next-auth" {
  interface Session {
    user: { id: string; appRole: AppRole; jobRole: JobRole } & import("next-auth").DefaultSession["user"];
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    appRole?: AppRole;
    jobRole?: JobRole;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      const r = await decideSignIn(
        prisma,
        account?.provider,
        { email: user.email, name: user.name, email_verified: profile?.email_verified, tid: (profile as { tid?: unknown } | undefined)?.tid },
        process.env,
      );
      return r.ok;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        // Fresh sign-in (signIn callback already vetted it): bind token to the DB user.
        const r = await resolveSignIn(prisma, { email: user.email, name: user.name }, process.env.ALLOWED_EMAIL_DOMAIN || DEFAULT_ALLOWED_DOMAIN, {
          viaAllowList: true,
        });
        if (!r.ok) return null;
        token.uid = r.user.id;
        token.appRole = r.user.appRole;
        token.jobRole = r.user.jobRole;
        return token;
      }
      // Every later call: re-read DB; deleted/inactive invalidates the session.
      return refreshJwt(prisma, token);
    },
    async session({ session, token }) {
      if (token.uid && token.appRole && token.jobRole) {
        session.user.id = token.uid;
        session.user.appRole = token.appRole;
        session.user.jobRole = token.jobRole;
      }
      return session;
    },
  },
});
