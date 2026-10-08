export type TocEntry = { level: 2 | 3; text: string; id: string };

/** Heading text to a URL-safe anchor: "Steps for ops!" becomes "steps-for-ops". */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `##` and `###` headings outside fenced code blocks, in document order. */
export function extractToc(body: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(##|###) (.+)$/.exec(line);
    if (!m) continue;
    const text = m[2].trim();
    entries.push({ level: m[1] === "##" ? 2 : 3, text, id: slugifyHeading(text) });
  }
  return entries;
}
