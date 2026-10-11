import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 15 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const RESEND_GAP_MS = 60_000;
export const RESENDS_PER_HOUR = 5;
export const INVITE_TTL_MS = 7 * 24 * 3_600_000;
export const UNVERIFIED_TTL_MS = 7 * 24 * 3_600_000;

/** 32 random bytes, base64url. Store only its hash. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 hex of a token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Six-digit verification code, zero padded. */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** HMAC-SHA256(secret, code) as hex. */
export function hashCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

/** Constant-time check of a code against its stored hash. */
export function codeMatches(code: string, hash: string, secret: string): boolean {
  const a = Buffer.from(hashCode(code, secret));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Shareable join-link code: 16 random bytes, base64url. */
export function newJoinCode(): string {
  return randomBytes(16).toString("base64url");
}

/** "andi@gmail.com" -> "a***@gmail.com". */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  return `${email.slice(0, 1)}***@${at < 0 ? "" : email.slice(at + 1)}`;
}

/** Post-sign-in redirect target: only "/lobby" or "/join/..." paths, else the fallback. */
export function safeNext(raw: string | null | undefined, fallback = "/lobby"): string {
  if (!raw || !raw.startsWith("/") || raw.includes("//") || raw.includes("\\")) return fallback;
  return raw === "/lobby" || raw.startsWith("/join/") ? raw : fallback;
}

/** HMAC secret for verification codes. Throws when AUTH_SECRET is missing. */
export function codeSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}
