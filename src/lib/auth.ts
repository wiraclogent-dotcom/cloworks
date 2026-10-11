import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "./db";
import { decideSignIn, resolveSignIn } from "./signin";
import { bindApplicantToken, bindSignInToken, refreshJwt } from "./session-core";
import { loadActiveUserOnce } from "./activeUser";
import { authenticateWithPassword } from "./passwordAuth";

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
        const who = await authenticateWithPassword(prisma, email, password);
        if (!who) throw new CredentialsSignin();
        // Member or applicant: the jwt callback re-resolves the email and binds the matching token kind.
        const row = who.kind === "user" ? who.user : who.applicant;
        return { id: row.id, email: row.email, name: row.name };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // Password sign-in was fully vetted in authorize() (right password; active if a member).
      if (account?.provider === "credentials") return true;
      const r = await decideSignIn(
        prisma,
        account?.provider,
        { email: user.email, name: user.name, email_verified: profile?.email_verified, tid: (profile as { tid?: unknown } | undefined)?.tid },
        process.env,
      );
      return r.ok;
    },
    async jwt({ token, user, account }) {
      if (user?.email) {
        // Fresh sign-in (signIn callback already vetted it): bind the token to the active User, else the Applicant.
        // Creates nothing; an email that matches neither (or an inactive User) gets no session.
        const r = await resolveSignIn(prisma, { email: user.email, name: user.name });
        if (!r.ok) return null;
        const row = r.kind === "user" ? r.user : r.applicant;
        // Password sign-in: authorize() vetted a specific row; refuse if the email now resolves to another one.
        if (account?.provider === "credentials" && user.id !== row.id) return null;
        return r.kind === "user" ? bindSignInToken(token, r.user) : bindApplicantToken(token, r.applicant);
      }
      // Every later call: re-read DB; deleted/inactive invalidates the session; an approved applicant becomes a member.
      return refreshJwt(prisma, token, loadActiveUserOnce);
    },
  },
});
