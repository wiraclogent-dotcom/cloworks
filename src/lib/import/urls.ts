export const URL_MAX = 2048;

/** Import-grade link check: absolute http(s), <= 2048 chars, no whitespace/control characters, no embedded credentials. */
export function isSafeHttpUrl(s: string): boolean {
  if (!s || s.length > URL_MAX || /[\s\u0000-\u001f\u007f]/.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password;
  } catch {
    return false;
  }
}
