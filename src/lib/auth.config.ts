import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/** Edge/DB-free part of the config, shared with proxy.ts. Env: AUTH_GOOGLE_ID/SECRET, AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER. */
export const authConfig = {
  providers: [Google, MicrosoftEntraID],
  pages: { signIn: "/signin", error: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      if (request.nextUrl.pathname.startsWith("/signin")) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
