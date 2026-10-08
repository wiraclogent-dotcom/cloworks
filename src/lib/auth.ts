import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "./db";
import { DEFAULT_ALLOWED_DOMAIN, decideSignIn, resolveSignIn } from "./signin";
import { bindSignInToken, refreshJwt } from "./session-core";

export { isAllowedEmail } from "./signin";

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
        return bindSignInToken(token, r.user);
      }
      // Every later call: re-read DB; deleted/inactive invalidates the session.
      return refreshJwt(prisma, token);
    },
  },
});
