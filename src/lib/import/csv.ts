import { parse } from "csv-parse/sync";

/** Parses a CSV export into header list + row objects (BOM tolerated, empty lines skipped). */
export function readCsv(text: string): { headers: string[]; rows: Record<string, string>[]; lines: number[] } {
  let headers: string[] = [];
  const recs = parse(text, {
    columns: (h: string[]) => { headers = h; return h; },
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
    info: true,
  }) as { record: Record<string, string>; info: { lines: number } }[];
  // info.lines is the line where the record ENDS; subtract embedded newlines to get its start line.
  const lines = recs.map((r) => {
    const embedded = Object.values(r.record).reduce((n, v) => n + (String(v).match(/\r\n|\n|\r/g)?.length ?? 0), 0);
    return r.info.lines - embedded;
  });
  return { headers, rows: recs.map((r) => r.record), lines };
}
