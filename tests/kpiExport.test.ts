import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import type { KpiResult } from "@/lib/kpi/metrics";
import type { TeamRow } from "@/components/kpi/TeamTable";
import { TEAM_REQUESTS_HEADER_ROW, teamRequestsFilename, teamRequestsWorkbook } from "@/lib/kpi/exportWorkbook";

const kpi = (over: Partial<KpiResult> = {}): KpiResult => ({
  tasksDone: 0, doneRequestIds: [], target: null, progress: null, onTimeRate: null, avgTurnaroundDays: null,
  revisionRounds: 0, totalOutputs: 0, activeWorkload: 0, ...over,
});

const rows: TeamRow[] = [
  { userId: "a", name: "Ayu", role: "DESIGNER", note: "Leave 3 days",
    kpi: kpi({ tasksDone: 12, target: 10, progress: 1.2, onTimeRate: 0.75, avgTurnaroundDays: 2.345, revisionRounds: 4, totalOutputs: 30, activeWorkload: 5 }) },
  { userId: "b", name: "Bima", role: "SOCIAL_MEDIA", kpi: kpi({ tasksDone: 3, activeWorkload: 7 }) },
];
const now = new Date("2026-10-19T07:05:00Z"); // 14:05 WIB

const values = (ws: ExcelJS.Worksheet, row: number) => (ws.getRow(row).values as unknown[]).slice(1);

describe("teamRequestsWorkbook", () => {
  it("titles the sheet with the month and the generation time in WIB", () => {
    const ws = teamRequestsWorkbook(rows, "2026-10", now).getWorksheet("Requests")!;
    expect(ws.getCell("A1").value).toBe("Team KPI: Requests, October 2026");
    expect(ws.getCell("A2").value).toBe("Generated 19 Oct 2026, 14:05 WIB");
  });

  it("writes the header row and freezes it with a filter", () => {
    const ws = teamRequestsWorkbook(rows, "2026-10", now).getWorksheet("Requests")!;
    expect(values(ws, TEAM_REQUESTS_HEADER_ROW)).toEqual([
      "Name", "Role", "Tasks done", "Target", "Progress", "On-time", "Avg turnaround (working days)", "Workload",
      "Revision rounds", "Total outputs", "Note",
    ]);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: TEAM_REQUESTS_HEADER_ROW });
    expect(ws.autoFilter).toBe(`A${TEAM_REQUESTS_HEADER_ROW}:K${TEAM_REQUESTS_HEADER_ROW + rows.length}`);
  });

  it("keeps numbers as numbers, ratios as percent cells and turnaround rounded to one decimal", () => {
    const ws = teamRequestsWorkbook(rows, "2026-10", now).getWorksheet("Requests")!;
    const r = TEAM_REQUESTS_HEADER_ROW + 1;
    expect(values(ws, r)).toEqual(["Ayu", "Designer", 12, 10, 1.2, 0.75, 2.3, 5, 4, 30, "Leave 3 days"]);
    expect(ws.getCell(`E${r}`).numFmt).toBe("0%");
    expect(ws.getCell(`F${r}`).numFmt).toBe("0%");
    expect(ws.getCell(`G${r}`).numFmt).toBe("0.0");
  });

  it("leaves missing values blank and workload blank for non-designers", () => {
    const ws = teamRequestsWorkbook(rows, "2026-10", now).getWorksheet("Requests")!;
    const r = ws.getRow(TEAM_REQUESTS_HEADER_ROW + 2);
    expect(r.getCell(1).value).toBe("Bima");
    expect(r.getCell(2).value).toBe("Social media");
    expect(r.getCell(3).value).toBe(3);
    for (const c of [4, 5, 6, 7, 8, 11]) expect(r.getCell(c).value).toBeNull();
  });

  it("round-trips through xlsx bytes", async () => {
    const bytes = await teamRequestsWorkbook(rows, "2026-10", now).xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(bytes);
    expect(back.getWorksheet("Requests")!.getCell(`C${TEAM_REQUESTS_HEADER_ROW + 1}`).value).toBe(12);
  });
});

describe("teamRequestsWorkbook measured in posts", () => {
  it("is a Content Plan sheet with post columns only", () => {
    const ws = teamRequestsWorkbook(rows, "2026-10", now, "posts").getWorksheet("Content Plan")!;
    expect(ws.getCell("A1").value).toBe("Team KPI: Content Plan, October 2026");
    expect(values(ws, TEAM_REQUESTS_HEADER_ROW)).toEqual(["Name", "Role", "Posts approved", "Target", "Progress", "On-time", "Note"]);
    expect(values(ws, TEAM_REQUESTS_HEADER_ROW + 1).slice(0, 3)).toEqual(["Ayu", "Designer", 12]);
    expect(teamRequestsFilename("2026-10", "posts")).toBe("team-kpi-content-plan-2026-10.xlsx");
  });
});

describe("teamRequestsFilename", () => {
  it("names the file after the month", () => {
    expect(teamRequestsFilename("2026-10")).toBe("team-kpi-requests-2026-10.xlsx");
  });
});
