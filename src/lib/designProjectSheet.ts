import type { ProjectStage } from "@prisma/client";

// Parsing for one design-project sheet tab (columns A-H only). Pure: no database access, so it can be unit-tested.
// The brand marker row (column A holds a single letter, e.g. "A") sits above the first task. Data starts at zero-based row 4.

export const STAGE: Record<string, ProjectStage> = {
  "Not Started": "NOT_STARTED",
  "First Preview": "FIRST_PREVIEW",
  "Manuscript": "MANUSCRIPT",
  "Manuscrip": "MANUSCRIPT", // spelling in the sheet's dropdown
  "Technical Artwork": "TECHNICAL_ARTWORK",
  "Approval": "APPROVAL",
  "Final Artwork": "FINAL_ARTWORK",
  "Canceled": "CANCELLED",
  "Cancelled": "CANCELLED",
};
export const DATA_FIRST_ROW = 4; // zero-based: sheet row 5 holds the brand section marker, row 6 is the first task

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Sheet dates are M/D/YYYY (or TBC). Stored as Jakarta-midnight instants, like the rest of the app.
export function sheetDate(s: string): Date | null {
  const t = s.trim();
  if (!t || t.toUpperCase() === "TBC") return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) throw new Error(`Unrecognised date "${t}"`);
  const [y, mo, d] = [Number(m[3]), Number(m[1]), Number(m[2])];
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00+07:00`);
  if (Number.isNaN(dt.getTime())) throw new Error(`Invalid date "${t}"`);
  return dt;
}

export type Row = {
  /** Sheet row number (1-based), used to match hyperlinks from the .xlsx export. */
  sheetRow: number;
  position: number;
  title: string;
  subTitle: string | null;
  ownerName: string | null;
  stage: ProjectStage | null;
  startDate: Date | null;
  dueDate: Date | null;
  dueTbc: boolean;
  fileName: string | null;
  fileUrl: string | null;
  notes: string | null;
};

/** `linksByRow` maps sheet row number to the URL of that row's File Document cell (from the .xlsx export). */
export function parseTasks(text: string, linksByRow: Map<number, string> = new Map()): Row[] {
  const grid = parseCsv(text).slice(DATA_FIRST_ROW);
  const out: Row[] = [];
  let title: string | null = null;
  for (const [i, r] of grid.entries()) {
    const sheetRow = DATA_FIRST_ROW + i + 1;
    const [a = "", t = "", sub = "", owner = "", progress = "", start = "", due = "", file = ""] = r.map((x) => x.trim());
    if (![t, sub, owner, progress, start, due, file].some(Boolean)) continue;
    // Brand section marker: a single letter in column A, a brand name, and nothing else on the row.
    const isMarker = /^[A-Z]$/.test(a) && !!t && ![sub, owner, progress, start, due, file].some(Boolean);
    if (isMarker) continue;
    if (a) throw new Error(`Sheet row ${sheetRow}: unexpected "${a}" in column A (only a brand marker such as "A" is allowed there)`);
    if (t) title = t;
    if (!title) throw new Error(`Row ${out.length + 1} has a variant but no product title above it`);
    const stage = progress ? STAGE[progress] : undefined;
    if (progress && !stage) throw new Error(`Unknown progress "${progress}" on "${title}"`);
    const placeholder = file === "Product Redesign";
    out.push({
      sheetRow,
      position: out.length + 1,
      title,
      subTitle: sub || null,
      ownerName: owner || null,
      stage: stage ?? null,
      startDate: sheetDate(start),
      dueDate: sheetDate(due),
      dueTbc: due.toUpperCase() === "TBC",
      fileName: file && !placeholder ? file : null,
      fileUrl: linksByRow.get(sheetRow) ?? null,
      notes: placeholder ? `Sheet file column: ${file}` : null,
    });
  }
  return out;
}

/** A variant already in the database, with the fields the sheet can match on. */
export type ExistingVariant = { id: string; title: string; subTitle: string | null };

/** Anything matched by product title and sub title (sheet rows, tracker lines). */
type Keyed = { title: string; subTitle: string | null };

export type SyncPlan<R extends Keyed = Row> = {
  /** Sheet rows with no matching variant yet: create them, stage (or status) from the sheet. */
  create: R[];
  /** Sheet rows matching an existing variant: refresh sheet fields, keep the stage (or status) set in the app. */
  update: { id: string; row: R }[];
  /** Variants in the database that no longer appear in the sheet. Left alone, reported only. */
  missing: ExistingVariant[];
};

const variantKey = (title: string, subTitle: string | null) => `${title}\u0000${subTitle ?? ""}`;

/**
 * Matches sheet rows to existing variants by product title and sub title. Throws when a key is ambiguous, so
 * the import never guesses which variant a row belongs to.
 */
export function planTaskSync<R extends Keyed>(existing: ExistingVariant[], incoming: R[]): SyncPlan<R> {
  const byKey = new Map<string, ExistingVariant>();
  for (const v of existing) {
    const k = variantKey(v.title, v.subTitle);
    if (byKey.has(k)) throw new Error(`Two variants share the name "${v.title} / ${v.subTitle ?? "-"}" in the database; fix that first.`);
    byKey.set(k, v);
  }
  const seen = new Set<string>();
  const create: R[] = [];
  const update: SyncPlan<R>["update"] = [];
  for (const r of incoming) {
    const k = variantKey(r.title, r.subTitle);
    if (seen.has(k)) throw new Error(`The sheet has two rows for "${r.title} / ${r.subTitle ?? "-"}"; make them unique first.`);
    seen.add(k);
    const match = byKey.get(k);
    if (match) update.push({ id: match.id, row: r });
    else create.push(r);
  }
  const missing = existing.filter((v) => !seen.has(variantKey(v.title, v.subTitle)));
  return { create, update, missing };
}
