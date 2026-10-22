import ExcelJS from "exceljs";
import type { TeamRow } from "@/components/kpi/TeamTable";
import { JOB_ROLE_LABEL } from "@/lib/settings/account";
import { monthLabel } from "./months";
import { MEASURE_LABEL, type KpiMeasure } from "./team";

/** Rows 1–2 are the title and the generation time, row 3 is blank, the table starts here. */
export const TEAM_REQUESTS_HEADER_ROW = 4;

type Column = { header: string; width: number; numFmt?: string; value: (r: TeamRow) => string | number | null; requestsOnly?: true };

// Numbers stay numbers (ratios as 0..1 with a percent format) so the sheet can be summed and charted; a missing
// value is a blank cell, never "—".
const ALL_COLUMNS: Column[] = [
  { header: "Name", width: 28, value: (r) => r.name },
  { header: "Role", width: 14, value: (r) => JOB_ROLE_LABEL[r.role] },
  { header: "Tasks done", width: 12, value: (r) => r.kpi.tasksDone },
  { header: "Target", width: 10, value: (r) => r.kpi.target },
  { header: "Progress", width: 11, numFmt: "0%", value: (r) => r.kpi.progress },
  { header: "On-time", width: 10, numFmt: "0%", value: (r) => r.kpi.onTimeRate },
  { header: "Avg turnaround (working days)", width: 16, numFmt: "0.0", requestsOnly: true,
    value: (r) => (r.kpi.avgTurnaroundDays === null ? null : Math.round(r.kpi.avgTurnaroundDays * 10) / 10) },
  // Workload is a designer measure (the page shows "—" for everyone else).
  { header: "Workload", width: 11, requestsOnly: true, value: (r) => (r.role === "DESIGNER" ? r.kpi.activeWorkload : null) },
  { header: "Revision rounds", width: 12, requestsOnly: true, value: (r) => r.kpi.revisionRounds },
  { header: "Total outputs", width: 12, requestsOnly: true, value: (r) => r.kpi.totalOutputs },
  { header: "Note", width: 40, value: (r) => r.note || null },
];

const generatedAt = (now: Date) =>
  `Generated ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(now)} WIB`;

/**
 * Team KPI's main table for `month` as a one-sheet workbook, the same rows the page table shows: Requests, or for
 * `measure` posts (the social media team) Content Plan, with "Posts approved" and without the request-only columns.
 */
export function teamRequestsWorkbook(rows: TeamRow[], month: string, now: Date, measure: KpiMeasure = "requests"): ExcelJS.Workbook {
  const label = MEASURE_LABEL[measure];
  const columns = measure === "requests" ? ALL_COLUMNS
    : ALL_COLUMNS.filter((c) => !c.requestsOnly).map((c) => (c.header === "Tasks done" ? { ...c, header: label.done, width: 14 } : c));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Clowork";
  wb.created = now;
  const ws = wb.addWorksheet(label.section, { views: [{ state: "frozen", ySplit: TEAM_REQUESTS_HEADER_ROW }] });

  ws.getCell("A1").value = `Team KPI: ${label.section}, ${monthLabel(month)}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = generatedAt(now);
  ws.getCell("A2").font = { italic: true, color: { argb: "FF6B7280" } };

  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
  const header = ws.getRow(TEAM_REQUESTS_HEADER_ROW);
  header.values = columns.map((c) => c.header);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = { bottom: { style: "thin" } };
  });

  rows.forEach((r, i) => {
    const row = ws.getRow(TEAM_REQUESTS_HEADER_ROW + 1 + i);
    columns.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      cell.value = c.value(r);
      if (c.numFmt) cell.numFmt = c.numFmt;
    });
  });

  const lastCol = String.fromCharCode(64 + columns.length);
  ws.autoFilter = `A${TEAM_REQUESTS_HEADER_ROW}:${lastCol}${TEAM_REQUESTS_HEADER_ROW + rows.length}`;
  return wb;
}

export function teamRequestsFilename(month: string, measure: KpiMeasure = "requests"): string {
  return `team-kpi-${measure === "posts" ? "content-plan" : "requests"}-${month}.xlsx`;
}
