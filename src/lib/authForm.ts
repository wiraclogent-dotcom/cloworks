/**
 * Result state for the sign-up / verify / join forms (Next redacts thrown errors, so outcomes are data). Messages are
 * always fixed copy; `values` only ever carries non-secret fields back into the form, never into a URL.
 */
export type AuthFormState = {
  error?: string;
  info?: string;
  values?: Record<string, string>;
  /** When a verification code was last sent (ms since epoch), so the Resend countdown restarts. */
  sentAt?: number;
  nonce: string;
} | null;

export const failed = (error: string, values?: Record<string, string>): NonNullable<AuthFormState> => ({ error, values, nonce: crypto.randomUUID() });

export const told = (info: string, extra: { sentAt?: number } = {}): NonNullable<AuthFormState> => ({ info, ...extra, nonce: crypto.randomUUID() });

/** A FormData field as a trimmed string ("" when missing, not a string, or longer than `max`). */
export function field(fd: FormData, name: string, { max = 500, trim = true }: { max?: number; trim?: boolean } = {}): string {
  const v = fd.get(name);
  if (typeof v !== "string" || v.length > max) return "";
  return trim ? v.trim() : v;
}

/** Join-link codes are base64url; anything else is not a code and is never put into a URL or the page. */
export const JOIN_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const isJoinCode = (s: string | null | undefined): s is string => !!s && JOIN_CODE_RE.test(s);

/** Invite tokens are base64url too (32 bytes → 43 chars); only the charset is checked here. */
export const isInviteToken = (s: string | null | undefined): s is string => !!s && /^[A-Za-z0-9_-]{1,128}$/.test(s);

/** First value of a search param. */
export const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
