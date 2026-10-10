// Pure mention parsing, safe to import from client components (collab.ts pulls in server-only notify code).

/**
 * Mention rule: a token is `@` (not preceded by a letter/digit/underscore) followed by letters, digits, `_`, `-` or `.`;
 * trailing `.`/`-` are dropped so `@irsyad,` / `@irsyad.` work. Tokens and candidate keys are lowercased and have spaces
 * removed, so `@DimasPandu` matches the short name "Dimas Pandu". Candidate keys: the user's `name`, plus every alias
 * that is a single word (no spaces). Whole-token equality only (`@Dim` never matches Dimas). A token matching two
 * different ACTIVE users is ambiguous and ignored; unmatched tokens are plain text.
 */
export const MENTION_RE = /(?<![\p{L}\p{N}_])@([\p{L}\p{N}_][\p{L}\p{N}_.-]*)/gu;

export function mentionTokens(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) out.push(m[1].replace(/[.-]+$/, "").toLowerCase());
  return out;
}

/** Splits text into plain and @mention segments (for highlighting without HTML). */
export function splitMentions(body: string): { text: string; mention: boolean }[] {
  const segs: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const full = m[0];
    const trimmed = full.replace(/[.-]+$/, "");
    const start = m.index!;
    if (start > last) segs.push({ text: body.slice(last, start), mention: false });
    segs.push({ text: trimmed, mention: true });
    last = start + trimmed.length;
  }
  if (last < body.length) segs.push({ text: body.slice(last), mention: false });
  return segs;
}
