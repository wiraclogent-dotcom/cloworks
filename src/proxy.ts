import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Next 16: `middleware.ts` is renamed `proxy.ts`. Uses the DB-free config only.
export const proxy = NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
