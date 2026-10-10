import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "./db";
import { DEFAULT_ALLOWED_DOMAIN, decideSignIn, resolveSignIn } from "./signin";
import { bindSignInToken, refreshJwt } from "./session-core";
import { loadActiveUserOnce } from "./activeUser";
import { authenticateWithPassword } from "./passwordAuth";

export { isAllowedEmail } from "./signin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      id: "credentials",
      credentials: { email: {}, password: {} },
      async authorize(c) {
        const email = typeof c?.email === "string" ? c.email : "";
        const password = typeof c?.password === "string" ? c.password : "";
        const user = await authenticateWithPassword(prisma, email, password);
        if (!user) throw new CredentialsSignin();
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // Password sign-in was fully vetted in authorize() (active, permitted email, right password).
      if (account?.provider === "credentials") return true;
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
      return refreshJwt(prisma, token, loadActiveUserOnce);
    },
  },
});
