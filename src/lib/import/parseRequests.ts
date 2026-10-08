import { createHash } from "node:crypto";
import type { RequestStatus } from "@prisma/client";
import { isHttpUrl } from "@/lib/fieldSchema";
import { resolveUser, normalizeName, type ImportUser } from "./aliases";

/*
 * IMPORTANT: the sheet has no completion dates. Synthetic DONE events are placed at the deadline
 * (or the request date when there is none). Therefore on-time rate and turnaround for imported
 * months are NOT meaningful. Tasks-done KPI is unaffected.
 */
export const DONE_CAVEAT =
  "Completion dates are not in the sheet; DONE events are placed at the deadline, so on-time rate and turnaround for imported months are NOT meaningful. Tasks-done KPI is unaffected.";

export type ImportSource = "requests" | "socmed";
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
};

type Canon =
  | "requester" | "brand" | "division" | "platform" | "task" | "briefLink" | "notes" | "linkUpload" | "requestDate"
  | "deadline" | "designer" | "progress" | "shooting" | "upload" | "edited" | "designFolder" | "output" | "includeKpi";

const normHeader = (h: string) => h.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();

// Order matters: first matching canonical wins per header. Derived columns (Days Left, Request Time,
// Month_Key) are deliberately absent so they are never read.
const MATCHERS: [Canon, (h: string) => boolean][] = [
  ["requestDate", (h) => h.includes("request date")],
  ["requester", (h) => h.includes("requester")],
  ["designer", (h) => h.includes("designer")],
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
const REQUIRED: Canon[] = ["requester", "brand", "division", "task", "requestDate", "deadline", "designer", "progress"];
const LABEL: Record<Canon, string> = {
  requester: "Requester", brand: "Brand", division: "Division", platform: "Platform", task: "Task", briefLink: "Brief Link",
  notes: "Notes", linkUpload: "Link Upload", requestDate: "Request Date", deadline: "Deadline", designer: "Designer",
  progress: "Progress", shooting: "Shooting", upload: "Upload", edited: "Edited", designFolder: "Design Folder",
  output: "Jumlah Output", includeKpi: "Include_KPI",
};

function mapHeaders(headers: string[]): Partial<Record<Canon, string>> {
  const out: Partial<Record<Canon, string>> = {};
  for (const h of headers) {
    const n = normHeader(h);
    const hit = MATCHERS.find(([c, f]) => !out[c] && f(n));
    if (hit) out[hit[0]] = h;
  }
  const missing = REQUIRED.filter((c) => !out[c]);
  if (missing.length) throw new Error(`Missing required header(s): ${missing.map((c) => LABEL[c]).sort().join(", ")}`);
  return out;
}

/** Strict date parse with the source's explicit format; null when invalid/impossible. */
export function parseSheetDate(s: string, format: "dmy" | "mdy"): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
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
const clip = (s: string, n: number) => s.slice(0, n);

export function parseRequestRows(
  source: ImportSource,
  rows: Record<string, string>[],
  ctx: ParseCtx,
  headers: string[] = Object.keys(rows[0] ?? {}),
): { records: ImportRecord[]; report: ParseReport } {
  const hm = mapHeaders(headers);
  const fmt = source === "requests" ? "dmy" : "mdy";
  const get = (r: Record<string, string>, c: Canon) => (hm[c] ? (r[hm[c]!] ?? "").trim() : "");
  const records: ImportRecord[] = [];
  const report: ParseReport = { source, rowsRead: rows.length, importable: 0, template: 0, skipped: [], warnings: [], unmapped: [], months: {} };
  const seen = new Map<string, number>();
  const wira = ctx.users.find((u) => u.name.trim().toLowerCase() === "wira");
  const brandByName = new Map(ctx.brands.map((b) => [b.name.trim().toLowerCase(), b.id]));
  const divByName = new Map(ctx.divisions.map((d) => [d.name.trim().toLowerCase(), d.id]));

  rows.forEach((r, i) => {
    const row = i + 2; // header is line 1
    const skip = (reason: string) => report.skipped.push({ row, reason });
    const warn = (message: string) => report.warnings.push({ row, message });

    const task = get(r, "task");
    if (!task) return skip("Blank task");
    if (task.toLowerCase() === "contoh task") { report.template++; return; }
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
    let requesterId = resolveUser(reqText, ctx.users);
    if (!requesterId) {
      if (!wira) return skip("Requester unresolved and no fallback user named Wira");
      requesterId = wira.id;
      if (reqText) report.unmapped.push({ row, field: "Requester", value: reqText });
      warn(reqText ? `Requester "${reqText}" not found; used Wira` : "Blank requester; used Wira");
    }

    const progText = get(r, "progress");
    const status = PROGRESS[normalizeName(progText)];
    if (!status) warn(progText ? `Unknown progress "${progText}"; imported as REQUESTED` : "Blank progress; imported as REQUESTED");
    const finalStatus = status ?? "REQUESTED";

    const desText = get(r, "designer");
    let assigneeId: string | null = null;
    if (desText) {
      assigneeId = resolveUser(desText, ctx.users);
      if (!assigneeId) {
        report.unmapped.push({ row, field: "Designer", value: desText });
        warn(`Designer "${desText}" not found; left unassigned`);
      }
    } else if (finalStatus !== "REQUESTED") warn("Blank designer on a non-REQUESTED row; left unassigned");

    const dlText = get(r, "deadline");
    const deadline = dlText ? parseSheetDate(dlText, fmt) : null;
    if (dlText && !deadline) warn(`Invalid deadline "${dlText}"; left empty`);

    const outRaw = get(r, "output");
    const out = /^\d+$/.test(outRaw) ? Number(outRaw) : 0;
    const outputCount = out >= 1 ? out : 1;

    const extra: string[] = [];
    const brief = get(r, "briefLink");
    const folder = get(r, "designFolder");
    const briefUrl = brief && isHttpUrl(brief) ? brief : null;
    const designFolderUrl = folder && isHttpUrl(folder) ? folder : null;
    if (brief && !briefUrl) extra.push(`Brief: ${brief}`);
    if (folder && !designFolderUrl) extra.push(`Folder: ${folder}`);
    const notesText = get(r, "notes");
    const notes = clip([notesText, ...extra].filter(Boolean).join("\n"), 5000) || null;

    const includeKpi = source === "socmed" ? !["no", "false", "0"].includes(get(r, "includeKpi").toLowerCase()) : true;

    const fields: ImportRecord["fields"] = { importKey, importSource: source };
    if (source === "socmed") {
      const plat = get(r, "platform").toLowerCase();
      if (plat === "tiktok") fields.platform = "TikTok";
      else if (plat === "instagram") fields.platform = "Instagram";
      const up = notesText.toUpperCase();
      let best: string | null = null, bestAt = Infinity;
      for (const ct of CONTENT_TYPES) {
        const at = up.indexOf(ct.toUpperCase());
        if (at >= 0 && at < bestAt) { best = ct; bestAt = at; }
      }
      if (best) fields.contentType = best;
      fields.shooting = get(r, "shooting").toUpperCase() === "TRUE";
      fields.upload = get(r, "upload").toUpperCase() === "TRUE";
      fields.editing = get(r, "edited").toUpperCase() === "TRUE";
      const pub = get(r, "linkUpload");
      if (pub && isHttpUrl(pub)) fields.publishedUrl = pub;
    }

    records.push({
      source, row, title: clip(task, 200), briefUrl, notes, brandId, divisionId,
      typeName: source === "socmed" ? "Social Media" : "General Design",
      requesterId, assigneeId, requestedAt, deadline, status: finalStatus, outputCount, includeKpi, designFolderUrl, fields,
    });
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
