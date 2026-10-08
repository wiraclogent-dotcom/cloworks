import NextAuth from "next-auth";
import type { AppRole, JobRole } from "@prisma/client";
import { authConfig } from "./auth.config";
import { prisma } from "./db";
import { DEFAULT_ALLOWED_DOMAIN, resolveSignIn } from "./signin";

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

const domain = () => process.env.ALLOWED_EMAIL_DOMAIN || DEFAULT_ALLOWED_DOMAIN;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      const r = await resolveSignIn(prisma, { email: user.email, name: user.name }, domain());
      return r.ok;
    },
    async jwt({ token, user }) {
      // `user` is only present on sign-in; re-resolve the DB user then so role/active are fresh.
      if (user?.email) {
        const r = await resolveSignIn(prisma, { email: user.email, name: user.name }, domain());
        if (r.ok) {
          token.uid = r.user.id;
          token.appRole = r.user.appRole;
          token.jobRole = r.user.jobRole;
        }
      }
      return token;
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
