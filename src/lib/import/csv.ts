import { parse } from "csv-parse/sync";

/** Parses a CSV export into header list + row objects (BOM tolerated, empty lines skipped). */
export function readCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  let headers: string[] = [];
  const rows = parse(text, {
    columns: (h: string[]) => { headers = h; return h; },
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as Record<string, string>[];
  return { headers, rows };
}
