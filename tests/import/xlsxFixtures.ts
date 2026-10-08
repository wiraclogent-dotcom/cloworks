import ExcelJS from "exceljs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Real-layout fixture workbook (three import tabs + an ignored tab) built with exceljs into a temp dir. */
export const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
export const link = (text: string, hyperlink: string) => ({ text, hyperlink });

export const REQ_HDR = ["Requester", "Brand", "Division", "Task", "Brief Link", "Notes", "Request Date", "Deadline", "Request Time", "Days Left", "Designer", "Progress", "Design Folder", "Jumlah Output"];
export const SOC_HDR = ["Requester", "Brand", "Division", "Platform", "Task", "Brief Link", "Notes", "Published", "Link Upload", "KerKun", "Request Date", "Deadline", "Request Time", "Days Left", "Designer/Editor", "Progress", "Shooting", "Upload", "Edited", "Design Folder", "Jumlah Output", "Month_Key", "Include_KPI"];

export type Cell = ExcelJS.CellValue;
const rowOf = (hdr: string[], o: Record<string, Cell>): Cell[] => hdr.map((h) => (h in o ? o[h] : null));

export const DIMAS_LOG: [Date, string, boolean][] = [
  [utc(2026, 9, 17), "FAFA 12 SEPT 1", true],
  [utc(2026, 9, 17), "FAFA 12 SEPT 2", true],
  [utc(2026, 9, 18), "SYAHDA 28 SEPT 1", true],
  [utc(2026, 9, 30), "RIO 12 SEPT 1", true],
  [utc(2026, 10, 1), "MOTION DEMO", true],
  [utc(2026, 10, 2), "MOTION DEMO", true],
  [utc(2026, 10, 7), "MOTION DEMO", true],
  [utc(2026, 9, 25), "RESIZE KONTEN DEMO", true],
  [utc(2026, 9, 25), "RESIZE KONTEN DEMO", true],
];
/** Fixture log rows dated in September 2026 (for the KPI proof). */
export const DIMAS_SEPT = DIMAS_LOG.filter(([d]) => d.getUTCMonth() === 8).length;

export async function buildFixtureWorkbook(): Promise<{ file: string; dir: string; cleanup: () => void }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crt-xlsx-"));
  const file = path.join(dir, "master.xlsx");
  const wb = new ExcelJS.Workbook();

  // ---- Request List All Clogent (header row 1; row 2 = the sheet's template row)
  const rl = wb.addWorksheet("Request List All Clogent");
  rl.addRow(REQ_HDR);
  const R = (o: Record<string, Cell>) => rl.addRow(rowOf(REQ_HDR, o));
  R({ Requester: "Wira", Brand: "Clogent", Division: "Creative", Task: "Contoh Task | JANGAN DI HAPUS", "Brief Link": link("Brief Mei", "https://example.com/brief/TEMPLATE"), "Request Date": utc(2026, 5, 22), Deadline: utc(2026, 5, 22), "Request Time": { formula: "IF(G2:G3400=\"\", \"\", H2:H3400 - G2:G3400)", result: 0 }, Designer: "Daus", Progress: "Done" }); // row 2
  R({ Requester: "Rio", Brand: "Clogent", Division: "Creative", Task: "Banner Promo", "Brief Link": link("Brief Banner", "https://example.com/brief/AAA"), Notes: "Mohon cepat", "Request Date": utc(2026, 6, 4), Deadline: utc(2026, 6, 5), "Request Time": { formula: "H3-G3", result: 1 }, "Days Left": { formula: "IF(...)", result: "Completed" }, Designer: "Irshyad", Progress: "Done", "Design Folder": link("Folder Banner", "https://example.com/folder/FFF"), "Jumlah Output": 2 }); // 3: 4 June
  R({ Requester: "Rio", Brand: "Bubble Wash", Division: "Creative", Task: "Label Refill", "Request Date": utc(2026, 4, 6), Deadline: utc(2026, 4, 9), Designer: "Fadli", Progress: "Done" }); // 4: 6 April
  R({ Requester: "Yoel", Brand: "Clogent", Division: "Creative", Task: "Poster Akhir Bulan", "Request Date": utc(2026, 9, 30), Deadline: utc(2026, 10, 2), Designer: "Fadli", Progress: "Done" }); // 5: month-end
  R({ Requester: "Ibnu", Brand: "Clogent", Division: "Creative", Task: "Mailto Link", "Brief Link": link("mail me", "mailto:x@y.z"), "Request Date": utc(2026, 7, 1), Designer: "Fadli", Progress: "On Progress", "Design Folder": link("evil", "javascript:alert(1)") }); // 6
  R({ Requester: "Rio", Brand: "Clogent", Division: "Creative", Task: "Rich Notes", Notes: { richText: [{ text: "Hello " }, { text: "World" }] }, "Brief Link": link("https://example.com/s/abc", "https://example.com/s/abc"), "Request Date": utc(2026, 7, 2), Designer: "Fadli", Progress: "Requested", "Design Folder": link("Folder with space", "https://bad host/x") }); // 7
  R({ Requester: " ", Brand: "Clogent", Division: "Creative", Task: "Blank requester", "Request Date": utc(2026, 7, 3), Designer: "", Progress: "Requested", "Brief Link": link("frag", "#gid=0") }); // 8

  // ---- SocMed Tracker (two header rows; data from row 3; blank formatted rows below)
  const sm = wb.addWorksheet("SocMed Tracker");
  const grp = sm.addRow([]);
  grp.getCell(1).value = "Diisi oleh SocMed"; grp.getCell(11).value = "Otomatis"; grp.getCell(15).value = "Diisi oleh Creative";
  sm.addRow(SOC_HDR);
  const S = (o: Record<string, Cell>) => sm.addRow(rowOf(SOC_HDR, o));
  S({ Requester: "Fafa", Brand: "Bubble Wash", Division: "Social Media", Platform: "TikTok", Task: "Short Video A", "Brief Link": link("Content Plan", "https://example.com/brief/BBB"), Notes: "CAMPAIGN CONTENT", Published: true, "Link Upload": { text: { richText: [{ text: "https://example.com/post/1" }] }, hyperlink: "https://example.com/post/1" } as unknown as Cell, KerKun: false, "Request Date": utc(2026, 9, 30), Deadline: utc(2026, 10, 1), "Request Time": { formula: "L3-K3", result: 1 }, "Days Left": { formula: "x", result: "Completed" }, "Designer/Editor": "Fadli", Progress: "Done", Shooting: true, Upload: true, Edited: true, "Design Folder": link("https://example.com/s/2bVjw", "https://example.com/s/2bVjw"), "Jumlah Output": 1, Month_Key: { formula: "TEXT()", result: "2026-09" }, Include_KPI: "Yes" }); // 3
  S({ Requester: "Fafa", Brand: "Bubble Wash", Division: "Social Media", Platform: "Instagram", Task: "Reel B", "Request Date": utc(2026, 10, 5), Deadline: utc(2026, 10, 6), "Designer/Editor": "Fadli", Progress: "Done", Shooting: false, Upload: false, Edited: true, "Jumlah Output": 2, Month_Key: { formula: "TEXT()", result: "2026-10" }, Include_KPI: "Yes" }); // 4
  S({ Requester: "Fafa", Brand: "Clogent", Division: "Social Media", Platform: "TikTok", Task: "Story C", "Request Date": utc(2026, 10, 6), Deadline: utc(2026, 10, 7), "Designer/Editor": "Fadli", Progress: "Done", Shooting: false, Upload: false, Edited: false, "Jumlah Output": 1, Include_KPI: "No" }); // 5
  S({ Requester: "Rio", Brand: "Clogent", Division: "Social Media", Platform: "TikTok", Task: "Rio Post", "Request Date": utc(2026, 10, 3), Deadline: utc(2026, 10, 4), "Designer/Editor": "Fadli", Progress: "Done", "Jumlah Output": 1, Include_KPI: "Yes" }); // 6
  // formatted-but-empty rows down to 60 (array-formula style leftovers must not be read)
  for (let r = 7; r <= 60; r++) sm.getRow(r).getCell(13).value = { formula: "IF(K3:K60=\"\",\"\",1)", result: "" };

  // ---- Dimas Tracker (A..F log; G blank; side KPI table H..N)
  const dm = wb.addWorksheet("Dimas Tracker");
  dm.addRow(["No", "Tanggal", "Nam File", "Shooting", "Upload", "Editing", null, "Dimas"]);
  DIMAS_LOG.forEach(([d, name, ed], i) => {
    if (i === 5) dm.addRow([null, utc(2026, 10, 2), null, true, null, true, null, "Nov"]); // dated row with blank file name
    const r = dm.addRow([{ formula: "ROW()-2", result: i + 1 }, d, name, true, null, ed]);
    if (i === 0) { r.getCell(8).value = "Bulan"; r.getCell(9).value = "Tanggal Awal"; }
    if (i === 1) { r.getCell(8).value = "September"; r.getCell(9).value = utc(2026, 9, 1); r.getCell(13).value = 84; }
  });
  // side-table remnants on rows without a file name
  const rem = dm.addRow([null, null, null, null, null, null, null, "Oktober", utc(2026, 10, 1), utc(2026, 10, 31)]);
  rem.getCell(12).value = 8;
  dm.addRow([{ formula: "ROW()-2", result: "" }]);

  // ---- an ignored tab
  const team = wb.addWorksheet("Team");
  team.addRow(["Name", "Role"]);
  team.addRow(["Fadli", "Designer"]);

  await wb.xlsx.writeFile(file);
  return { file, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
