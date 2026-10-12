import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /lobby/enter: the way in for someone whose cookie may still hold the applicant token after approval or invite
 * acceptance. `auth(handler)` (the request form) reads the session through Auth.js with the full config, so the jwt
 * callback upgrades the token, and copies the refreshed Set-Cookie onto this response (plain `auth()` in server
 * components and actions never writes cookies). The shared `authorized` routing already redirects a member to
 * /requests with that cookie; the handler covers the rest: a waiting applicant back to the lobby, nobody to sign-in.
 */
export const GET = auth((req) => {
  const u = req.auth?.user;
  const to = u?.appRole ? "/requests" : u?.applicantId ? "/lobby" : "/signin";
  return NextResponse.redirect(new URL(to, req.nextUrl));
});
