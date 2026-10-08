import fs from "node:fs";
import ExcelJS from "exceljs";
import { isSafeHttpUrl } from "./urls";

/** Same shape the CSV reader produces and parseRequestRows consumes; lines = real worksheet row numbers. */
export type SourceTable = { headers: string[]; rows: Record<string, string>[]; lines: number[] };
export type MasterWorkbook = { requests: SourceTable; socmed: SourceTable; dimas: SourceTable };

const norm = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();

/** Link columns whose real target is exposed in an extra "<Header> URL" column. */
const LINK_HEADERS = new Set(["brief link", "design folder", "link upload"]);

type Fmt = "dmy" | "mdy";
type Cv = ExcelJS.CellValue;
type Cell = { text: string; url: string };

const pad = (n: number) => String(n).padStart(2, "0");
/** Excel date-only cells arrive as UTC midnight, so UTC getters give the sheet's calendar date. */
function dateText(d: Date, fmt: Fmt): string {
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return fmt === "dmy" ? `${pad(day)}/${pad(m)}/${y}` : `${m}/${day}/${y}`;
}

/** Only safe absolute http(s) links survive (no mailto:, javascript:, #fragments, credentials, control chars, > 2048 chars). */
function cleanUrl(u: unknown): string {
  if (typeof u !== "string") return "";
  const s = u.trim();
  return isSafeHttpUrl(s) ? s : "";
}

/** Plain value of any exceljs cell shape. Never evaluates formulas: cached results only. */
function cell(v: Cv | undefined, fmt: Fmt): Cell {
  if (v === null || v === undefined) return { text: "", url: "" };
  if (v instanceof Date) return { text: dateText(v, fmt), url: "" };
  if (typeof v === "boolean") return { text: v ? "TRUE" : "FALSE", url: "" };
  if (typeof v === "number") return { text: Number.isFinite(v) ? String(v) : "", url: "" };
  if (typeof v === "string") return { text: v, url: "" };
  const o = v as unknown as Record<string, unknown>;
  if ("error" in o) return { text: "", url: "" };
  if ("hyperlink" in o) return { text: cell(o.text as Cv, fmt).text, url: cleanUrl(o.hyperlink) };
  if ("richText" in o && Array.isArray(o.richText)) return { text: (o.richText as { text?: string }[]).map((p) => p.text ?? "").join(""), url: "" };
  if ("formula" in o || "sharedFormula" in o) return cell(o.result as Cv, fmt);
  return { text: "", url: "" };
}

type Spec = {
  label: string;           // human tab name
  names: string[];         // accepted normalized tab names
  required: string[][];    // each entry: any of these normalized headers must be present
  keyHeaders: string[];    // normalized Task / file-name header
  fmt: Fmt;
  contiguous?: boolean;    // read only the first contiguous block of headed columns (Dimas side table)
};

const SPECS: Record<"requests" | "socmed" | "dimas", Spec> = {
  requests: { label: "Request List All Clogent", names: ["request list all clogent"], required: [["requester"], ["task"]], keyHeaders: ["task"], fmt: "dmy" },
  socmed: { label: "SocMed Tracker", names: ["socmed tracker"], required: [["task"], ["brief link"]], keyHeaders: ["task"], fmt: "mdy" },
  dimas: { label: "Dimas Tracker", names: ["dimas tracker"], required: [["tanggal"], ["nam file", "nama file"]], keyHeaders: ["nam file", "nama file"], fmt: "mdy", contiguous: true },
};

function readTable(ws: ExcelJS.Worksheet, spec: Spec): SourceTable {
  const maxCol = Math.max(ws.columnCount, 1);
  const textRow = (r: number) => Array.from({ length: maxCol }, (_, i) => cell(ws.getRow(r).getCell(i + 1).value, spec.fmt).text);

  let hdrRow = 0, hdrTexts: string[] = [];
  for (let r = 1; r <= 5; r++) {
    const t = textRow(r);
    const n = t.map(norm);
    if (spec.required.every((alts) => alts.some((a) => n.includes(a)))) { hdrRow = r; hdrTexts = t; break; }
  }
  if (!hdrRow)
    throw new Error(`Tab "${spec.label}": no header row found in the first 5 rows (expected headers: ${spec.required.map((a) => a[0] === "nam file" ? "Nam File" : a[0].replace(/^./, (c) => c.toUpperCase())).join(" + ")}).`);

  // Columns that carry a header (Dimas: only the first contiguous block, so the side table is never read).
  const cols: { idx: number; header: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < hdrTexts.length; i++) {
    const h = hdrTexts[i].trim();
    if (!h) { if (spec.contiguous && cols.length) break; continue; }
    if (seen.has(h)) continue;
    seen.add(h);
    cols.push({ idx: i + 1, header: hdrTexts[i] });
  }
  if (spec.contiguous) {
    const need = spec.required.map((alts) => alts.find((a) => cols.some((c) => norm(c.header) === a)));
    if (need.some((n) => !n))
      throw new Error(`Tab "${spec.label}": the ${spec.required.map((a) => (a[0] === "nam file" ? "Nam File" : "Tanggal")).join(" and ")} columns must sit in the first contiguous block of headed columns (no blank header cell between them); only that block is read.`);
  }
  const urlCols = cols.filter((c) => LINK_HEADERS.has(norm(c.header)));
  const headers = [...cols.map((c) => c.header), ...urlCols.map((c) => `${c.header} URL`)];

  const key = cols.find((c) => spec.keyHeaders.includes(norm(c.header)))!;
  let last = hdrRow;
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n > hdrRow && cell(row.getCell(key.idx).value, spec.fmt).text.trim() !== "") last = n;
  });

  const rows: Record<string, string>[] = [];
  const lines: number[] = [];
  for (let r = hdrRow + 1; r <= last; r++) {
    const row = ws.getRow(r);
    const rec: Record<string, string> = {};
    let any = false;
    for (const c of cols) {
      const v = cell(row.getCell(c.idx).value, spec.fmt);
      rec[c.header] = v.text;
      if (v.text.trim() !== "") any = true;
      if (LINK_HEADERS.has(norm(c.header))) { rec[`${c.header} URL`] = v.url; if (v.url) any = true; }
    }
    if (!any) continue;
    rows.push(rec);
    lines.push(r);
  }
  return { headers, rows, lines };
}

function findSheet(wb: ExcelJS.Workbook, spec: Spec): ExcelJS.Worksheet {
  const ws = wb.worksheets.find((w) => spec.names.includes(norm(w.name)));
  if (!ws) throw new Error(`Tab "${spec.label}" not found in the workbook. Found tabs: ${wb.worksheets.map((w) => `"${w.name}"`).join(", ") || "(none)"}.`);
  return ws;
}

/** Reads the three import tabs of the owner's master workbook (.xlsx export of the Google Sheet). */
export async function readMasterWorkbook(file: string): Promise<MasterWorkbook> {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(file);
  } catch (e) {
    throw new Error(`Could not read ${file} as an .xlsx workbook: ${e instanceof Error ? e.message : e}`);
  }
  const requests = readTable(findSheet(wb, SPECS.requests), SPECS.requests);
  const socmed = readTable(findSheet(wb, SPECS.socmed), SPECS.socmed);
  const dimas = readTable(findSheet(wb, SPECS.dimas), SPECS.dimas);

  // Sanity (replaces the CSV swap check): tabs are matched by name, but make sure their content fits.
  const has = (t: SourceTable, h: string) => t.headers.some((x) => norm(x) === h);
  if (has(requests, "platform") || has(requests, "include kpi"))
    throw new Error('Tab "Request List All Clogent" has a Platform/Include_KPI column, so it looks like the SocMed Tracker. Check the tab names.');
  const miss = ["platform", "include kpi"].filter((h) => !has(socmed, h));
  if (miss.length) throw new Error(`Tab "SocMed Tracker" is missing the ${miss.map((m) => (m === "platform" ? "Platform" : "Include_KPI")).join(" and ")} header(s); it does not look like the SocMed Tracker.`);
  return { requests, socmed, dimas };
}
