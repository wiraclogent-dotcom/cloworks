import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readMasterWorkbook } from "@/lib/import/readWorkbook";
import { buildFixtureWorkbook, REQ_HDR, SOC_HDR, DIMAS_LOG, utc } from "./xlsxFixtures";

let fx: Awaited<ReturnType<typeof buildFixtureWorkbook>>;
let t: Awaited<ReturnType<typeof readMasterWorkbook>>;
beforeAll(async () => {
  fx = await buildFixtureWorkbook();
  t = await readMasterWorkbook(fx.file);
});
afterAll(() => fx?.cleanup());

const byTask = (tbl: { rows: Record<string, string>[] }, task: string, key = "Task") => tbl.rows.find((r) => r[key] === task)!;

describe("readMasterWorkbook: Request List tab", () => {
  it("headers = sheet headers + URL columns; template row kept with real line number", () => {
    expect(t.requests.headers).toEqual([...REQ_HDR, "Brief Link URL", "Design Folder URL"]);
    expect(t.requests.lines).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(t.requests.rows[0].Task).toBe("Contoh Task | JANGAN DI HAPUS");
  });
  it("dates come from the real date (dd/mm/yyyy), no d/m ambiguity or month shift", () => {
    const a = byTask(t.requests, "Banner Promo");
    expect([a["Request Date"], a.Deadline]).toEqual(["04/06/2026", "05/06/2026"]);
    expect(byTask(t.requests, "Label Refill")["Request Date"]).toBe("06/04/2026");
    expect(byTask(t.requests, "Poster Akhir Bulan")["Request Date"]).toBe("30/09/2026");
  });
  it("hyperlink cells: label in the column, target in '<Header> URL'", () => {
    const a = byTask(t.requests, "Banner Promo");
    expect(a["Brief Link"]).toBe("Brief Banner");
    expect(a["Brief Link URL"]).toBe("https://example.com/brief/AAA");
    expect(a["Design Folder"]).toBe("Folder Banner");
    expect(a["Design Folder URL"]).toBe("https://example.com/folder/FFF");
  });
  it("drops mailto:, javascript:, #fragment and targets containing spaces but keeps the label", () => {
    const m = byTask(t.requests, "Mailto Link");
    expect([m["Brief Link"], m["Brief Link URL"], m["Design Folder"], m["Design Folder URL"]]).toEqual(["mail me", "", "evil", ""]);
    expect(byTask(t.requests, "Rich Notes")["Design Folder URL"]).toBe("");
    expect(byTask(t.requests, "Blank requester")["Brief Link URL"]).toBe("");
  });
  it("other shapes: numbers -> integer strings, formula -> cached result, rich text -> joined, blank -> ''", () => {
    const a = byTask(t.requests, "Banner Promo");
    expect(a["Jumlah Output"]).toBe("2");
    expect(a["Request Time"]).toBe("1");
    expect(a["Days Left"]).toBe("Completed");
    expect(byTask(t.requests, "Rich Notes").Notes).toBe("Hello World");
    expect(byTask(t.requests, "Label Refill").Notes).toBe("");
    expect(byTask(t.requests, "Blank requester").Requester).toBe(" "); // nothing trimmed
  });
});

describe("readMasterWorkbook: SocMed tab", () => {
  it("skips the group header row, stops at the last Task row (not the 60 formatted rows)", () => {
    expect(t.socmed.headers).toEqual([...SOC_HDR, "Brief Link URL", "Link Upload URL", "Design Folder URL"]);
    expect(t.socmed.lines).toEqual([3, 4, 5, 6]);
  });
  it("dates m/d/yyyy, booleans TRUE/FALSE, rich-text link label, three URL columns", () => {
    const a = byTask(t.socmed, "Short Video A");
    expect([a["Request Date"], a.Deadline]).toEqual(["9/30/2026", "10/1/2026"]);
    expect([a.Published, a.KerKun, a.Shooting, a.Upload, a.Edited]).toEqual(["TRUE", "FALSE", "TRUE", "TRUE", "TRUE"]);
    expect(a["Link Upload"]).toBe("https://example.com/post/1");
    expect(a["Link Upload URL"]).toBe("https://example.com/post/1");
    expect(a["Brief Link URL"]).toBe("https://example.com/brief/BBB");
    expect(a["Design Folder URL"]).toBe("https://example.com/s/2bVjw");
    expect(a.Month_Key).toBe("2026-09");
    expect(a["Jumlah Output"]).toBe("1");
    expect(byTask(t.socmed, "Reel B")["Request Date"]).toBe("10/5/2026");
  });
});

describe("readMasterWorkbook: Dimas tab", () => {
  it("reads only A..F (side table ignored); blank-file-name rows with other values kept; empty rows dropped", () => {
    expect(t.dimas.headers).toEqual(["No", "Tanggal", "Nam File", "Shooting", "Upload", "Editing"]);
    expect(t.dimas.rows).toHaveLength(DIMAS_LOG.length + 1);
    for (const r of t.dimas.rows) expect(Object.keys(r).sort()).toEqual([...t.dimas.headers].sort());
    expect(t.dimas.lines[0]).toBe(2);
    expect(t.dimas.lines.at(-1)).toBe(DIMAS_LOG.length + 2); // one extra blank-name row inside the log
  });
  it("m/d/yyyy dates, TRUE booleans, empty Upload", () => {
    const r = t.dimas.rows[0];
    expect([r.Tanggal, r["Nam File"], r.Shooting, r.Upload, r.Editing]).toEqual(["9/17/2026", "FAFA 12 SEPT 1", "TRUE", "", "TRUE"]);
    expect(t.dimas.rows.filter((x) => x["Nam File"] === "MOTION DEMO")).toHaveLength(3);
  });
});

describe("readMasterWorkbook: errors and tolerance", () => {
  const tmp: string[] = [];
  afterAll(() => tmp.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  async function make(build: (wb: ExcelJS.Workbook) => void) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crt-xlsx-e-"));
    tmp.push(dir);
    const wb = new ExcelJS.Workbook();
    build(wb);
    const f = path.join(dir, "w.xlsx");
    await wb.xlsx.writeFile(f);
    return f;
  }
  const good = (wb: ExcelJS.Workbook, names = ["Request List All Clogent", "SocMed Tracker", "Dimas Tracker"]) => {
    wb.addWorksheet(names[0]).addRows([["Requester", "Task"], ["Wira", "A"]]);
    wb.addWorksheet(names[1]).addRows([["Requester", "Platform", "Task", "Brief Link", "Include_KPI"], ["Wira", "TikTok", "B", null, "Yes"]]);
    wb.addWorksheet(names[2]).addRows([["No", "Tanggal", "Nam File"], [1, utc(2026, 9, 1), "RIO 1"]]);
  };
  it("missing tab names the tabs that were found", async () => {
    const f = await make((wb) => { good(wb, ["Request List All Clogent", "SocMed Tracker", "Dimas Trackerz"]); });
    await expect(readMasterWorkbook(f)).rejects.toThrow(/Dimas Tracker[\s\S]*Found tabs: [\s\S]*Dimas Trackerz/);
  });
  it("tab names match case/whitespace-insensitively", async () => {
    const f = await make((wb) => good(wb, [" request  list ALL clogent", "socmed tracker ", "DIMAS  tracker"]));
    const r = await readMasterWorkbook(f);
    expect([r.requests.rows.length, r.socmed.rows.length, r.dimas.rows.length]).toEqual([1, 1, 1]);
  });
  it("header row is found within the first 5 rows; missing header fails clearly", async () => {
    const f = await make((wb) => {
      good(wb);
      wb.getWorksheet("Request List All Clogent")!.spliceRows(1, 0, ["junk"], ["junk"], ["junk"]);
    });
    expect((await readMasterWorkbook(f)).requests.lines).toEqual([5]);
    const g = await make((wb) => { good(wb); wb.getWorksheet("Dimas Tracker")!.spliceRows(1, 1, ["No", "Whatever"]); });
    await expect(readMasterWorkbook(g)).rejects.toThrow(/Dimas Tracker[\s\S]*header row[\s\S]*Tanggal[\s\S]*Nam File/);
  });
  it("sanity: Request List must not have Platform/Include_KPI; SocMed must", async () => {
    const f = await make((wb) => { good(wb); wb.getWorksheet("Request List All Clogent")!.spliceRows(1, 1, ["Requester", "Task", "Platform", "Include_KPI"]); });
    await expect(readMasterWorkbook(f)).rejects.toThrow(/Request List[\s\S]*Platform\/Include_KPI/);
    const g = await make((wb) => { good(wb); wb.getWorksheet("SocMed Tracker")!.spliceRows(1, 1, ["Requester", "Task", "Brief Link"]); });
    await expect(readMasterWorkbook(g)).rejects.toThrow(/SocMed[\s\S]*Platform[\s\S]*Include_KPI/);
  });
  it("Dimas columns outside the first contiguous header block: named, readable error", async () => {
    const f = await make((wb) => { good(wb); wb.getWorksheet("Dimas Tracker")!.spliceRows(1, 1, ["No", "Tanggal", null, "Nam File"]); });
    await expect(readMasterWorkbook(f)).rejects.toThrow(/Dimas Tracker[\s\S]*Tanggal[\s\S]*Nam File[\s\S]*contiguous/);
  });
  it("hyperlink targets with credentials / control characters / over 2048 chars are dropped", async () => {
    const f = await make((wb) => {
      good(wb);
      const ws = wb.getWorksheet("SocMed Tracker")!;
      ws.spliceRows(1, 1, ["Requester", "Platform", "Task", "Brief Link", "Include_KPI", "Link Upload"]);
      ws.getRow(2).getCell(4).value = { text: "a", hyperlink: "https://user:pw@example.com/x" };
      ws.getRow(2).getCell(6).value = { text: "b", hyperlink: "https://example.com/" + "a".repeat(2100) };
    });
    const r = (await readMasterWorkbook(f)).socmed.rows[0];
    expect([r["Brief Link"], r["Brief Link URL"], r["Link Upload"], r["Link Upload URL"]]).toEqual(["a", "", "b", ""]);
  });
  it("error cell values read as empty", async () => {
    const f = await make((wb) => { good(wb); wb.getWorksheet("Request List All Clogent")!.getRow(2).getCell(1).value = { error: "#N/A" }; });
    expect((await readMasterWorkbook(f)).requests.rows[0].Requester).toBe("");
  });
});
