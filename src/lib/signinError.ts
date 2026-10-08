/** Maps the Auth.js `?error=` code on /signin to fixed text. Only "AccessDenied" is distinguished; the raw param is never echoed. */

export const DENIED_MESSAGE = "This account is not allowed to sign in yet. Ask Wira to add your email.";
export const FAILED_MESSAGE = "Sign-in failed. Try again, or ask Wira for help.";

/** One neutral line for a failed sign-in, or null when there is no error. Unknown codes get the generic line. */
export function signInErrorMessage(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  if (!c) return null;
  if (c === "AccessDenied") return DENIED_MESSAGE;
  return FAILED_MESSAGE; // every other code, known or not, is deliberately the same generic line
}
