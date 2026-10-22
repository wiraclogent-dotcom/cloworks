import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { UnauthenticatedError } from "@/lib/session-core";
import { TEAM_REQUESTS_HEADER_ROW } from "@/lib/kpi/exportWorkbook";

let signedIn = true;
let viewer = { id: "u1", name: "Wira", appRole: "REQUESTER", jobRole: "OTHER", workspaceId: "w", mustChangePassword: false };
const teamRequestsData = vi.fn();

vi.mock("@/lib/session", () => ({
  requireUser: async () => { if (!signedIn) throw new UnauthenticatedError(); return viewer; },
  dbFor: () => ({ scoped: true }),
}));
vi.mock("@/lib/kpi/pageData", () => ({ teamRequestsData: (...a: unknown[]) => teamRequestsData(...a) }));

import { GET } from "@/app/(app)/dashboard/team/export/route";

const get = (qs = "") => GET(new Request(`http://localhost/dashboard/team/export${qs}`));

beforeEach(() => {
  signedIn = true;
  viewer = { ...viewer, appRole: "REQUESTER" };
  vi.clearAllMocks();
  teamRequestsData.mockResolvedValue({
    automaticCount: 1,
    rows: [{ userId: "a", name: "Ayu", role: "DESIGNER", kpi: {
      tasksDone: 7, doneRequestIds: [], target: 10, progress: 0.7, onTimeRate: 1, avgTurnaroundDays: 2,
      revisionRounds: 1, totalOutputs: 9, activeWorkload: 3 } }],
  });
});

describe("GET /dashboard/team/export", () => {
  it("returns 401 when signed out", async () => {
    signedIn = false;
    expect((await get("?month=2026-10")).status).toBe(401);
    expect(teamRequestsData).not.toHaveBeenCalled();
  });

  it("returns 403 without Team KPI access", async () => {
    viewer = { ...viewer, appRole: "UNKNOWN" }; // every real role can view Team KPI today; an unknown one cannot
    expect((await get("?month=2026-10")).status).toBe(403);
    expect(teamRequestsData).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed month", async () => {
    expect((await get("?month=2026-13")).status).toBe(400);
    expect((await get("?month=oct")).status).toBe(400);
    expect(teamRequestsData).not.toHaveBeenCalled();
  });

  it("sends the month's table as an xlsx attachment", async () => {
    const res = await get("?month=2026-09");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="team-kpi-requests-2026-09.xlsx"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(teamRequestsData).toHaveBeenCalledWith({ scoped: true }, "2026-09", "creative");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const ws = wb.getWorksheet("Requests")!;
    expect(ws.getCell("A1").value).toBe("Team KPI: Requests, September 2026");
    expect(ws.getCell(`A${TEAM_REQUESTS_HEADER_ROW + 1}`).value).toBe("Ayu");
  });

  it("sends a social media lead the Content Plan sheet of their team", async () => {
    viewer = { ...viewer, appRole: "LEAD", jobRole: "SOCIAL_MEDIA" };
    const res = await get("?month=2026-10");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="team-kpi-content-plan-2026-10.xlsx"');
    expect(teamRequestsData).toHaveBeenCalledWith({ scoped: true }, "2026-10", "social");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    expect(wb.getWorksheet("Content Plan")!.getCell("A1").value).toBe("Team KPI: Content Plan, October 2026");
  });

  it("gives a non-admin their own team whatever ?team says, and never a 400 for it", async () => {
    viewer = { ...viewer, appRole: "LEAD", jobRole: "DESIGNER" };
    expect((await get("?month=2026-10&team=social")).status).toBe(200);
    viewer = { ...viewer, appRole: "REQUESTER", jobRole: "OTHER" };
    expect((await get("?month=2026-10&team=junk")).status).toBe(200);
    expect(teamRequestsData.mock.calls.map((c) => c[2])).toEqual(["creative", "creative"]);
  });

  it("lets an admin download either team", async () => {
    viewer = { ...viewer, appRole: "ADMIN", jobRole: "DESIGNER" };
    await get("?month=2026-10&team=social");
    await get("?month=2026-10");
    expect(teamRequestsData.mock.calls.map((c) => c[2])).toEqual(["social", "creative"]);
  });

  it("defaults to the current month when none is given", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(teamRequestsData.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}$/);
  });
});
