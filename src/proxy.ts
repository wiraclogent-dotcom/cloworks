import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Next 16: `middleware.ts` is renamed `proxy.ts`. Uses the DB-free config only.
export const proxy = NextAuth(authConfig).auth;

// /lobby/enter is skipped: its own route handler runs the same `authorized` routing and writes the refreshed session
// cookie; the proxy would otherwise also re-set the stale (applicant) cookie on that response.
export const config = {
  matcher: ["/((?!api/auth|lobby/enter$|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
