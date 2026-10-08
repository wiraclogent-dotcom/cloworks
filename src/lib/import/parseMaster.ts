import type { MasterWorkbook } from "./readWorkbook";
import { parseDimasRows, parseRequestRows, type ImportRecord, type ParseCtx, type ParseReport } from "./parseRequests";
import { inferBrands } from "./inferBrands";

/** Parses the three tabs; reports come back in the order requests, socmed, dimas. Throws on header problems before any write. */
export function parseMaster(t: MasterWorkbook, ctx: ParseCtx): { records: ImportRecord[]; reports: ParseReport[] } {
  const req = parseRequestRows("requests", t.requests.rows, ctx, t.requests.headers, t.requests.lines);
  const soc = parseRequestRows("socmed", t.socmed.rows, ctx, t.socmed.headers, t.socmed.lines);
  const dim = parseDimasRows(t.dimas.rows, ctx, t.dimas.headers, t.dimas.lines);
  const inferred = inferBrands(dim.records, [...req.records, ...soc.records], ctx.brands);
  dim.report.brandInferred = inferred.inferred;
  return { records: [...req.records, ...soc.records, ...inferred.records], reports: [req.report, soc.report, dim.report] };
}
