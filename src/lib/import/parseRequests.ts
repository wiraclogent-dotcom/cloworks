import { createHash } from "node:crypto";
import type { RequestStatus } from "@prisma/client";
import { isSafeHttpUrl as isHttpUrl } from "./urls";
import { resolveUserDetailed, normalizeName, type ImportUser } from "./aliases";

/*
 * IMPORTANT: the sheet has no completion dates. Synthetic DONE events are placed at the deadline
 * (or the request date when there is none). Therefore on-time rate and turnaround for imported
 * months are NOT meaningful. Tasks-done KPI is unaffected.
 */
export const DONE_CAVEAT =
  "Completion dates are not in the sheet; DONE events are placed at the deadline, so on-time rate and turnaround for imported months are NOT meaningful. Tasks-done KPI is unaffected.";

export type ImportSource = "requests" | "socmed" | "dimas";
export type ParseCtx = { users: ImportUser[]; brands: { id: string; name: string }[]; divisions: { id: string; name: string }[] };

export type ImportRecord = {
  source: ImportSource;
  row: number;
  title: string;
  briefUrl: string | null;
  notes: string | null;
  brandId: string;
  divisionId: string;
  typeName: string;
  requesterId: string;
  /** Dimas only: false when the requester could not be read from the file name (Wira fallback). */
  requesterRecorded?: boolean;
  assigneeId: string | null;
  requestedAt: Date;
  deadline: Date | null;
  status: "REQUESTED" | "ON_PROGRESS" | "FIRST_LOOK" | "DONE";
  outputCount: number;
  includeKpi: boolean;
  designFolderUrl: string | null;
  fields: Record<string, unknown> & { importKey: string; importSource: ImportSource };
};

export type ParseReport = {
  source: ImportSource;
  rowsRead: number;
  importable: number;
  template: number;
  skipped: { row: number; reason: string }[];
  warnings: { row: number; message: string }[];
  unmapped: { row: number; field: string; value: string }[];
  months: Record<string, number>;
  /** First 3 parsed rows: raw date text next to the Jakarta ISO date it became (to eyeball d/m vs m/d). */
  samples: { row: number; requestRaw: string; requestIso: string; deadlineRaw: string; deadlineIso: string | null }[];
  /** Date order assumed for this source. */
  dateFormat: "dmy" | "mdy";
  /** Records that carry a real link target (from URL columns or URL-valued cells). */
  links: { brief: number; folder: number; published: number };
  /** Dimas only: rows whose brand was inferred (the log has no brand column). */
  brandInferred?: number;
};

type Canon =
  | "requester" | "brand" | "division" | "platform" | "task" | "briefLink" | "notes" | "linkUpload" | "requestDate"
  | "deadline" | "designer" | "progress" | "shooting" | "upload" | "edited" | "designFolder" | "output" | "includeKpi"
  | "briefLinkUrl" | "designFolderUrl" | "linkUploadUrl";

const normHeader = (h: string) => h.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();

// Order matters: first matching canonical wins per header. Derived columns (Days Left, Request Time,
// Month_Key) are deliberately absent so they are never read.
const MATCHERS: [Canon, (h: string) => boolean][] = [
  ["requestDate", (h) => h.includes("request date")],
  ["requester", (h) => h.includes("requester")],
  ["designer", (h) => h.includes("designer")],
  ["linkUploadUrl", (h) => h === "link upload url"],
  ["briefLinkUrl", (h) => h === "brief link url"],
  ["designFolderUrl", (h) => h === "design folder url"],
  ["linkUpload", (h) => h === "link upload"],
  ["briefLink", (h) => h === "brief link"],
  ["designFolder", (h) => h === "design folder"],
  ["includeKpi", (h) => h === "include kpi"],
  ["output", (h) => h === "jumlah output"],
  ["brand", (h) => h === "brand"],
  ["division", (h) => h === "division"],
  ["platform", (h) => h === "platform"],
  ["task", (h) => h === "task"],
  ["notes", (h) => h === "notes"],
  ["deadline", (h) => h === "deadline"],
  ["progress", (h) => h === "progress"],
  ["shooting", (h) => h === "shooting"],
  ["upload", (h) => h === "upload"],
  ["edited", (h) => h === "edited"],
];
// Optional canonical headers (never required): the real link targets from the .xlsx reader.
const REQUIRED: Canon[] = ["requester", "brand", "division", "task", "requestDate", "deadline", "designer", "progress"];
const LABEL: Record<Canon, string> = {
  requester: "Requester", brand: "Brand", division: "Division", platform: "Platform", task: "Task", briefLink: "Brief Link",
  notes: "Notes", linkUpload: "Link Upload", requestDate: "Request Date", deadline: "Deadline", designer: "Designer",
  progress: "Progress", shooting: "Shooting", upload: "Upload", edited: "Edited", designFolder: "Design Folder",
  output: "Jumlah Output", includeKpi: "Include_KPI",
  briefLinkUrl: "Brief Link URL", designFolderUrl: "Design Folder URL", linkUploadUrl: "Link Upload URL",
};

function mapHeaders(source: "requests" | "socmed", headers: string[]): Partial<Record<Canon, string>> {
  const out: Partial<Record<Canon, string>> = {};
  for (const h of headers) {
    const n = normHeader(h);
    const hit = MATCHERS.find(([c, f]) => !out[c] && f(n));
    if (hit) out[hit[0]] = h;
  }
  // Each export has its own identifying headers; guards against swapped file arguments.
  if (source === "socmed") {
    const need = (["platform", "includeKpi"] as Canon[]).filter((c) => !out[c]);
    if (need.length) throw new Error(`This does not look like the SocMed Tracker export (missing header(s): ${need.map((c) => LABEL[c]).join(", ")}). Pass the Request List first and the SocMed Tracker second.`);
  } else if (out.platform || out.includeKpi) {
    throw new Error("This looks like the SocMed export (it has a Platform/Include_KPI column); pass it as the second file.");
  }
  const missing = REQUIRED.filter((c) => !out[c]);
  if (missing.length) throw new Error(`Missing required header(s): ${missing.map((c) => LABEL[c]).sort().join(", ")}`);
  return out;
}

/** Strict date parse with the source's explicit format; null when invalid/impossible. */
export function parseSheetDate(s: string, format: "dmy" | "mdy"): Date | null {
  // An optional trailing time part is tolerated and ignored; the date part stays strict.
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)?$/.exec(s.trim());
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
  const [d, mo] = format === "dmy" ? [a, b] : [b, a];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return new Date(`${y}-${p(mo)}-${p(d)}T00:00:00+07:00`);
}

const PROGRESS: Record<string, ImportRecord["status"]> = {
  requested: "REQUESTED", onprogress: "ON_PROGRESS", firstlook: "FIRST_LOOK", done: "DONE",
};
const CONTENT_TYPES = ["Campaign", "Daily", "Story", "Urgent"];

function jakartaMonthOf(d: Date): string {
  const j = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}`;
}
/** Jakarta calendar date (YYYY-MM-DD) of an instant. */
const jakartaIso = (d: Date) => new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const clip = (s: string, n: number) => s.slice(0, n);
export const NOTES_MAX = 5000;
/** Joins the sheet's notes with import annotations; the notes themselves are shortened first so annotations survive the cap. */
function buildNotes(text: string, extra: string[]): string | null {
  const tail = extra.join("\n");
  if (!tail) return clip(text, NOTES_MAX) || null;
  const room = NOTES_MAX - tail.length - 1;
  const head = text && room > 0 ? clip(text, room) : "";
  return clip([head, tail].filter(Boolean).join("\n"), NOTES_MAX);
}

/**
 * The sheet's example row reads "Contoh Task | JANGAN DI HAPUS" ("example task | don't delete"),
 * so match on the prefix / the warning text, not the exact string. A real task that merely starts
 * with "Contoh " (e.g. "Contoh banner promo") is kept.
 */
function isTemplateTask(task: string): boolean {
  const t = task.toLowerCase().replace(/\s+/g, " ").trim();
  return t.startsWith("contoh task") || t.startsWith("isi dengan ") || t.includes("jangan di hapus") || t.includes("jangan dihapus");
}

export function parseRequestRows(
  source: "requests" | "socmed",
  rows: Record<string, string>[],
  ctx: ParseCtx,
  headers: string[] = Object.keys(rows[0] ?? {}),
  lines?: number[],
): { records: ImportRecord[]; report: ParseReport } {
  const hm = mapHeaders(source, headers);
  const fmt = source === "requests" ? "dmy" : "mdy";
  const get = (r: Record<string, string>, c: Canon) => (hm[c] ? (r[hm[c]!] ?? "").trim() : "");
  const records: ImportRecord[] = [];
  const report: ParseReport = { source, rowsRead: rows.length, importable: 0, template: 0, skipped: [], warnings: [], unmapped: [], months: {}, samples: [], dateFormat: fmt, links: { brief: 0, folder: 0, published: 0 } };
  const seen = new Map<string, number>();
  const wira = ctx.users.find((u) => u.name.trim().toLowerCase() === "wira");
  const brandByName = new Map(ctx.brands.map((b) => [b.name.trim().toLowerCase(), b.id]));
  const divByName = new Map(ctx.divisions.map((d) => [d.name.trim().toLowerCase(), d.id]));

  rows.forEach((r, i) => {
    const row = lines?.[i] ?? i + 2; // real CSV line when known (header is line 1)
    const skip = (reason: string) => report.skipped.push({ row, reason });
    const warn = (message: string) => report.warnings.push({ row, message });

    const task = get(r, "task");
    if (!task) return skip("Blank task");
    if (isTemplateTask(task)) { report.template++; return; }
    const requestedAt = parseSheetDate(get(r, "requestDate"), fmt);
    if (!requestedAt) return skip(`Invalid request date "${get(r, "requestDate")}"`);

    // Key uses raw normalized texts (stable regardless of lookups) + occurrence counter per file.
    const base = createHash("sha1")
      .update([source, normalizeName(get(r, "requester")), normalizeName(get(r, "brand")), normalizeName(task), requestedAt.toISOString()].join("|"))
      .digest("hex");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const importKey = n === 1 ? base : `${base}#${n}`;

    const brandId = brandByName.get(get(r, "brand").toLowerCase());
    if (!brandId) return skip(`Unknown brand "${get(r, "brand")}"`);
    const divisionId = divByName.get(get(r, "division").toLowerCase());
    if (!divisionId) return skip(`Unknown division "${get(r, "division")}"`);

    const reqText = get(r, "requester");
    const reqRes = resolveUserDetailed(reqText, ctx.users);
    let requesterId = reqRes.id;
    const extra: string[] = [];
    if (!requesterId) {
      if (!wira) return skip("Requester unresolved and no fallback user named Wira");
      requesterId = wira.id;
      if (reqText) report.unmapped.push({ row, field: "Requester", value: reqText });
      warn(reqText ? `Requester "${reqText}" ${reqRes.ambiguous ? "is ambiguous (matches several users)" : "not found"}; used Wira` : "Blank requester; used Wira");
      // Owner decision: do not try to identify nicknames / people outside the roster; keep what was typed.
      if (reqText) extra.push(`Requester (as typed): ${reqText}`);
    }

    const progText = get(r, "progress");
    const status = PROGRESS[normalizeName(progText)];
    if (!status) warn(progText ? `Unknown progress "${progText}"; imported as REQUESTED` : "Blank progress; imported as REQUESTED");
    const finalStatus = status ?? "REQUESTED";

    const desText = get(r, "designer");
    let assigneeId: string | null = null;
    if (desText) {
      const desRes = resolveUserDetailed(desText, ctx.users);
      assigneeId = desRes.id;
      if (!assigneeId) {
        report.unmapped.push({ row, field: "Designer", value: desText });
        warn(`Designer "${desText}" ${desRes.ambiguous ? "is ambiguous (matches several users)" : "not found"}; left unassigned`);
      }
    } else if (finalStatus !== "REQUESTED") warn("Blank designer on a non-REQUESTED row; left unassigned");

    const dlText = get(r, "deadline");
    const deadline = dlText ? parseSheetDate(dlText, fmt) : null;
    if (dlText && !deadline) warn(`Invalid deadline "${dlText}"; left empty`);

    const outRaw = get(r, "output");
    const out = /^\d+$/.test(outRaw) ? Number(outRaw) : 0;
    const outputCount = out >= 1 ? out : 1;
    if (outRaw && out < 1) warn(`Invalid Jumlah Output "${outRaw}"; used 1`);

    const brief = get(r, "briefLink");
    const folder = get(r, "designFolder");
    // A real target (URL column from the .xlsx reader, else a URL typed in the cell) wins; the visible
    // label is kept in notes unless it is the URL itself. Label-only cells go to notes as before.
    const pick = (label: string, urlCol: string): { url: string | null; label: string } => {
      const u = urlCol && isHttpUrl(urlCol) ? urlCol : label && isHttpUrl(label) ? label : null;
      return { url: u, label: !label || label === u ? "" : label };
    };
    const b = pick(brief, get(r, "briefLinkUrl"));
    const f = pick(folder, get(r, "designFolderUrl"));
    const briefUrl = b.url, designFolderUrl = f.url;
    const labelNotes: string[] = [];
    if (b.label) labelNotes.push(`Brief: ${b.label}`);
    if (f.label) labelNotes.push(`Folder: ${f.label}`);
    extra.unshift(...labelNotes);
    const notesText = get(r, "notes");
    const notes = buildNotes(notesText, extra);

    const includeKpi = source === "socmed" ? !["no", "false", "0"].includes(get(r, "includeKpi").toLowerCase()) : true;

    const fields: ImportRecord["fields"] = { importKey, importSource: source };
    if (source === "socmed") {
      const plat = get(r, "platform").toLowerCase();
      if (plat === "tiktok") fields.platform = "TikTok";
      else if (plat === "instagram") fields.platform = "Instagram";
      else warn(plat ? `Platform "${get(r, "platform")}" unknown; platform omitted` : "Platform missing; platform omitted");
      let best: string | null = null, bestAt = Infinity;
      for (const ct of CONTENT_TYPES) {
        const at = notesText.search(new RegExp(`\\b${ct}\\b`, "i"));
        if (at >= 0 && at < bestAt) { best = ct; bestAt = at; }
      }
      if (best) fields.contentType = best;
      else warn("contentType not derivable from Notes");
      fields.shooting = get(r, "shooting").toUpperCase() === "TRUE";
      fields.upload = get(r, "upload").toUpperCase() === "TRUE";
      fields.editing = get(r, "edited").toUpperCase() === "TRUE";
      const pubUrl = get(r, "linkUploadUrl");
      const pub = pubUrl && isHttpUrl(pubUrl) ? pubUrl : get(r, "linkUpload");
      if (pub && isHttpUrl(pub)) { fields.publishedUrl = pub; report.links.published++; }
    }

    if (briefUrl) report.links.brief++;
    if (designFolderUrl) report.links.folder++;
    records.push({
      source, row, title: clip(task, 200), briefUrl, notes, brandId, divisionId,
      typeName: source === "socmed" ? "Social Media" : "General Design",
      requesterId, assigneeId, requestedAt, deadline, status: finalStatus, outputCount, includeKpi, designFolderUrl, fields,
    });
    if (report.samples.length < 3)
      report.samples.push({ row, requestRaw: get(r, "requestDate"), requestIso: jakartaIso(requestedAt), deadlineRaw: dlText, deadlineIso: deadline ? jakartaIso(deadline) : null });
    const m = jakartaMonthOf(requestedAt);
    report.months[m] = (report.months[m] ?? 0) + 1;
  });
  report.importable = records.length;
  return { records, report };
}

const DIMAS_NOTE = "Video/motion edit logged in Dimas Tracker.";
export const DIMAS_TYPE = "Motion Support";
export const DIMAS_DESIGNER = "Dimas Pandu";
export const FALLBACK_BRAND = "Clogent";

const DIMAS_HEADERS: Record<"date" | "file" | "shooting" | "upload" | "editing", string[]> = {
  date: ["tanggal"], file: ["nam file", "nama file"], shooting: ["shooting"], upload: ["upload"], editing: ["editing", "edited"],
};

/**
 * "Dimas Tracker" log: one Motion Support task per row for the video editor (never merged into other
 * requests, even when the same content also appears there). Requester is inferred from the file name's
 * first word (FAFA, SYAHDA, RIO ...); anything else falls back to Wira. Brand is not in the log: the
 * record carries the fallback brand and inferBrands() refines it.
 */
export function parseDimasRows(
  rows: Record<string, string>[],
  ctx: ParseCtx,
  headers: string[] = Object.keys(rows[0] ?? {}),
  lines?: number[],
): { records: ImportRecord[]; report: ParseReport } {
  const col: Partial<Record<keyof typeof DIMAS_HEADERS, string>> = {};
  for (const h of headers) {
    const n = normHeader(h);
    for (const k of Object.keys(DIMAS_HEADERS) as (keyof typeof DIMAS_HEADERS)[]) if (!col[k] && DIMAS_HEADERS[k].includes(n)) col[k] = h;
  }
  const missing = [!col.date && "Tanggal", !col.file && "Nam File"].filter(Boolean);
  if (missing.length) throw new Error(`Dimas Tracker: missing required header(s): ${missing.join(", ")}`);
  const get = (r: Record<string, string>, k: keyof typeof DIMAS_HEADERS) => (col[k] ? (r[col[k]!] ?? "").trim() : "");

  const records: ImportRecord[] = [];
  const report: ParseReport = { source: "dimas", rowsRead: rows.length, importable: 0, template: 0, skipped: [], warnings: [], unmapped: [], months: {}, samples: [], dateFormat: "mdy", links: { brief: 0, folder: 0, published: 0 } };
  const seen = new Map<string, number>();
  const wira = ctx.users.find((u) => u.name.trim().toLowerCase() === "wira");
  const designer = resolveUserDetailed(DIMAS_DESIGNER, ctx.users).id;
  const brandId = ctx.brands.find((b) => b.name.trim().toLowerCase() === FALLBACK_BRAND.toLowerCase())?.id;
  const divisionId = ctx.divisions.find((d) => d.name.trim().toLowerCase() === "social media")?.id;

  rows.forEach((r, i) => {
    const row = lines?.[i] ?? i + 2;
    const file = get(r, "file");
    if (!file) return; // side-table remnants / empty log rows
    const skip = (reason: string) => report.skipped.push({ row, reason });
    const dateRaw = get(r, "date");
    const requestedAt = parseSheetDate(dateRaw, "mdy");
    if (!requestedAt) return skip(`Invalid date "${dateRaw}"`);

    const base = createHash("sha1").update(["dimas", normalizeName(file), requestedAt.toISOString()].join("|")).digest("hex");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const importKey = n === 1 ? base : `${base}#${n}`;

    if (!brandId) return skip(`Unknown brand "${FALLBACK_BRAND}"`);
    if (!divisionId) return skip('Unknown division "Social Media"');
    if (!designer) return skip(`Designer "${DIMAS_DESIGNER}" not found in the database`);

    let requesterId = resolveUserDetailed(file.split(/[\s_\-.]+/).find(Boolean) ?? "", ctx.users).id;
    const recorded = !!requesterId;
    if (!requesterId) {
      if (!wira) return skip("Requester not recorded and no fallback user named Wira");
      requesterId = wira.id;
      report.warnings.push({ row, message: `requester not recorded (first word of "${file}" is not a person); used Wira` });
    }

    records.push({
      source: "dimas", row, title: clip(file, 200), briefUrl: null, notes: recorded ? DIMAS_NOTE : `${DIMAS_NOTE}\nRequester not recorded in Dimas Tracker; Wira used.`,
      requesterRecorded: recorded, brandId, divisionId, typeName: DIMAS_TYPE, requesterId, assigneeId: designer, requestedAt, deadline: null, status: "DONE",
      outputCount: 1, includeKpi: true, designFolderUrl: null,
      fields: {
        shooting: get(r, "shooting").toUpperCase() === "TRUE", editing: get(r, "editing").toUpperCase() === "TRUE",
        upload: get(r, "upload").toUpperCase() === "TRUE", importSource: "dimas", importKey,
      },
    });
    if (report.samples.length < 3) report.samples.push({ row, requestRaw: dateRaw, requestIso: jakartaIso(requestedAt), deadlineRaw: "", deadlineIso: null });
    const m = jakartaMonthOf(requestedAt);
    report.months[m] = (report.months[m] ?? 0) + 1;
  });
  report.importable = records.length;
  return { records, report };
}

const CHAIN: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE"];

/** Synthetic history (see DONE_CAVEAT): all at requestedAt except DONE at (deadline ?? requestedAt). */
export function statusChain(r: Pick<ImportRecord, "status" | "requestedAt" | "deadline" | "requesterId" | "assigneeId">) {
  const actorId = r.assigneeId ?? r.requesterId;
  const upto = CHAIN.indexOf(r.status);
  const events: { from: RequestStatus | null; to: RequestStatus; at: Date; actorId: string }[] = [];
  for (let i = 0; i <= upto; i++) {
    const to = CHAIN[i];
    events.push({ from: i === 0 ? null : CHAIN[i - 1], to, at: to === "DONE" ? (r.deadline ?? r.requestedAt) : r.requestedAt, actorId });
  }
  return events;
}
