import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "./db";
import { decideSignIn, resolveSignIn } from "./signin";
import { bindApplicantToken, bindSignInToken, markSessionLength, refreshJwt, REMEMBER_SESSION_S } from "./session-core";
import { loadActiveUserOnce } from "./activeUser";
import { authenticateWithPassword } from "./passwordAuth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      id: "credentials",
      credentials: { email: {}, password: {}, remember: {} },
      async authorize(c) {
        const email = typeof c?.email === "string" ? c.email : "";
        const password = typeof c?.password === "string" ? c.password : "";
        const who = await authenticateWithPassword(prisma, email, password);
        if (!who) throw new CredentialsSignin();
        // Member or applicant: the jwt callback re-resolves the email and binds the matching token kind.
        const row = who.kind === "user" ? who.user : who.applicant;
        // "Remember me" rides on the user object into the jwt callback ("1" = checked).
        return { id: row.id, email: row.email, name: row.name, remember: c?.remember === "1" };
      },
    }),
  ],
  // 30 days is the "Remember me" lifetime; sessions without it carry `short` and end after 24 h (jwt callback).
  session: { strategy: "jwt", maxAge: REMEMBER_SESSION_S },
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
        // Only the password form has "Remember me"; OAuth sign-ins are always the 24 h session.
        const remember = account?.provider === "credentials" && (user as { remember?: unknown }).remember === true;
        markSessionLength(token, remember);
        return r.kind === "user" ? bindSignInToken(token, r.user) : bindApplicantToken(token, r.applicant);
      }
      // Every later call: re-read DB; deleted/inactive invalidates the session; an approved applicant becomes a member.
      return refreshJwt(prisma, token, loadActiveUserOnce);
    },
  },
});
