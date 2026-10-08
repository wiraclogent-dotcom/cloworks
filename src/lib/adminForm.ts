import { AdminError } from "./admin";

/** Result-object state shared by every admin form (Next redacts thrown errors, so failures are data). */
export type AdminFormState = {
  ok: boolean;
  message: string;
  code?: string;
  details?: string[];
  /** What the user typed, so the form can re-populate after an error. */
  values: Record<string, string>;
  nonce: string;
} | null;

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

/** Runs one admin operation; expected AdminErrors become a failure state that echoes the input. */
export async function adminResult(fd: FormData, work: () => Promise<string>): Promise<NonNullable<AdminFormState>> {
  const values = formValues(fd);
  try {
    const message = await work();
    return { ok: true, message, values: {}, nonce: crypto.randomUUID() };
  } catch (e) {
    if (e instanceof AdminError) return { ok: false, code: e.code, message: e.message, details: e.details, values, nonce: crypto.randomUUID() };
    throw e;
  }
}

/** "a, b ,c" -> ["a","b","c"] (empty entries dropped). */
export function splitList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
