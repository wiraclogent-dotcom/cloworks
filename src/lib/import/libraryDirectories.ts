import fs from "node:fs";
import ExcelJS from "exceljs";
import { cell } from "./readWorkbook";

/** One cell of a directory tab: its text and, for hyperlink cells, the safe http(s) target ("" otherwise). */
export type DirCell = { text: string; url: string };
type DirRow = Record<string, DirCell>;
/** What scripts/seed-library.ts adds: matched by `url`, so re-running skips items already there. */
export type DirItem = { title: string; url: string; description?: string; brand?: string; files: { label: string; url: string }[] };

/** A hostname made only of letters, digits, dots and hyphens; rules out file names pasted as links ("http://fa_x_75gr.ai/"). */
function realLink(url: string): string {
  try { return /^[a-z0-9.-]+$/i.test(new URL(url).hostname) ? url : ""; } catch { return ""; }
}
const get = (r: DirRow, h: string): DirCell => {
  const v = r[h] ?? { text: "", url: "" };
  return { text: v.text, url: realLink(v.url) };
};
const txt = (r: DirRow, h: string) => get(r, h).text.trim();
/** "Unknown" in the sheet means nobody filled it in. */
const known = (s: string) => (s && s.toLowerCase() !== "unknown" ? s : "");
const joined = (...parts: string[]) => parts.filter(Boolean).join(" · ") || undefined;

/** The first labelled link becomes the main link; the rest become file chips. Rows with no link at all are skipped. */
function withLinks(links: { label: string; url: string }[]): Pick<DirItem, "url" | "files"> | null {
  const present = links.filter((l) => l.url);
  return present.length ? { url: present[0].url, files: present.slice(1) } : null;
}

/** "MasterBox Directory" tab: Produk · Konfigurasi · Ukuran · Link PDF · Link AI. */
export function parseMasterBox(rows: DirRow[]): DirItem[] {
  return rows.flatMap((r) => {
    const title = txt(r, "Produk");
    const links = withLinks([{ label: "PDF", url: get(r, "Link PDF").url }, { label: "AI", url: get(r, "Link AI").url }]);
    if (!title || !links) return [];
    return [{ title, description: joined(known(txt(r, "Konfigurasi")), known(txt(r, "Ukuran"))), ...links }];
  });
}

/** "Packaging Directory" tab: Brand · Product Name · Fragrance · Konfigurasi · Netto · Packaging Type · Link PDF · Link AI · Mockup · New Design. */
export function parsePackaging(rows: DirRow[]): DirItem[] {
  const items = rows.flatMap((r) => {
    const product = txt(r, "Product Name");
    const links = withLinks([
      { label: "PDF", url: get(r, "Link PDF").url }, { label: "AI", url: get(r, "Link AI").url },
      { label: "Mockup", url: get(r, "Mockup").url }, { label: "New design", url: get(r, "New Design").url },
    ]);
    if (!product || !links) return [];
    const fragrance = known(txt(r, "Fragrance"));
    const title = (fragrance ? `${product} – ${fragrance}` : product) + (known(txt(r, "Konfigurasi")) ? ` · ${txt(r, "Konfigurasi")}` : "");
    const brand = known(txt(r, "Brand"));
    const netto = known(txt(r, "Netto"));
    const item: DirItem = { title, description: joined(netto, known(txt(r, "Packaging Type"))), ...(brand ? { brand } : {}), ...links };
    return [{ item, netto }];
  });
  // Sizes of the same product (100ml / 500ml) would share a title; add the netto only where that happens.
  const seen = new Map<string, number>();
  for (const { item } of items) seen.set(item.title, (seen.get(item.title) ?? 0) + 1);
  return items.map(({ item, netto }) => ((seen.get(item.title) ?? 0) > 1 && netto ? { ...item, title: `${item.title} · ${netto}` } : item));
}

/** Reads one tab (header row 1) into rows keyed by header text. */
function readTab(wb: ExcelJS.Workbook, name: string): DirRow[] {
  const ws = wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());
  if (!ws) throw new Error(`Tab "${name}" not found. Found: ${wb.worksheets.map((w) => `"${w.name}"`).join(", ")}.`);
  const headers = Array.from({ length: ws.columnCount }, (_, i) => cell(ws.getRow(1).getCell(i + 1).value, "dmy").text.trim());
  const rows: DirRow[] = [];
  for (let n = 2; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const rec: DirRow = {};
    headers.forEach((h, i) => { if (h) rec[h] = cell(row.getCell(i + 1).value, "dmy"); });
    rows.push(rec);
  }
  return rows;
}

/** The two directory tabs of the Creative Worksheet (.xlsx export), as Library items. */
export async function readLibraryDirectories(file: string): Promise<{ masterBox: DirItem[]; packaging: DirItem[] }> {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return { masterBox: parseMasterBox(readTab(wb, "MasterBox Directory")), packaging: parsePackaging(readTab(wb, "Packaging Directory")) };
}
