import { describe, it, expect } from "vitest";
import { parseRequestRows, statusChain } from "@/lib/import/parseRequests";
import { ctx, reqRow, socRow, REQ_HEADERS, SOC_HEADERS, row } from "./fixtures";

const req = (rows: Record<string, string>[], headers = REQ_HEADERS) => parseRequestRows("requests", rows, ctx, headers);
const soc = (rows: Record<string, string>[], headers = SOC_HEADERS) => parseRequestRows("socmed", rows, ctx, headers);

describe("parseRequestRows: requests source", () => {
  it("Done row: dd/mm/yyyy, Jakarta midnight, DONE chain at deadline", () => {
    const r = req([reqRow({})]);
    expect(r.records).toHaveLength(1);
    const rec = r.records[0];
    expect(rec.requestedAt.toISOString()).toBe("2026-05-21T17:00:00.000Z");
    expect(rec.deadline!.toISOString()).toBe("2026-06-03T17:00:00.000Z"); // 04/06 = 4 June
    expect(rec.status).toBe("DONE");
    expect(rec.requesterId).toBe("u-rio");
    expect(rec.assigneeId).toBe("u-irsyad");
    expect(rec.outputCount).toBe(2);
    expect(rec.includeKpi).toBe(true);
    expect(rec.typeName).toBe("General Design");
    expect(rec.fields.importSource).toBe("requests");
    expect(rec.fields.importKey).toMatch(/^[0-9a-f]{40}$/);
    const ev = statusChain(rec);
    expect(ev.map((e) => [e.from, e.to])).toEqual([[null, "REQUESTED"], ["REQUESTED", "ON_PROGRESS"], ["ON_PROGRESS", "FIRST_LOOK"], ["FIRST_LOOK", "DONE"]]);
    expect(ev.map((e) => e.at.toISOString())).toEqual([
      "2026-05-21T17:00:00.000Z", "2026-05-21T17:00:00.000Z", "2026-05-21T17:00:00.000Z", "2026-06-03T17:00:00.000Z",
    ]);
    expect(ev.every((e) => e.actorId === "u-irsyad")).toBe(true);
    expect(r.report.months).toEqual({ "2026-05": 1 });
  });
  it("DONE without deadline is placed at requestedAt; status chains for other states", () => {
    const rec = req([reqRow({ Deadline: "", Progress: "Done" })]).records[0];
    expect(rec.deadline).toBeNull();
    expect(statusChain(rec).at(-1)!.at).toEqual(rec.requestedAt);
    const lens = (p: string) => statusChain(req([reqRow({ Progress: p })]).records[0]).length;
    expect([lens("Requested"), lens(" on  progress "), lens("FIRST LOOK")]).toEqual([1, 2, 3]);
  });
  it("invalid date 31/02/2026 skips the row; invalid deadline -> null", () => {
    const r = req([reqRow({ "Request Date": "31/02/2026" }), reqRow({ Task: "B", Deadline: "31/02/2026" }), reqRow({ Task: "C", "Request Date": "" })]);
    expect(r.records.map((x) => x.title)).toEqual(["B"]);
    expect(r.records[0].deadline).toBeNull();
    expect(r.report.skipped).toHaveLength(2);
    expect(r.report.skipped[0].reason).toMatch(/request date/i);
  });
  it("m/d/yyyy-looking value invalid in dd/mm source (no guessing)", () => {
    expect(req([reqRow({ "Request Date": "9/30/2026" })]).records).toHaveLength(0);
  });
  it("template, blank task, unknown brand/division skipped", () => {
    const r = req([reqRow({ Task: " contoh task " }), reqRow({ Task: "  " }), reqRow({ Brand: "Nope" }), reqRow({ Division: "Nope" }), reqRow({ Brand: "clogent", Task: "ok" })]);
    expect(r.records.map((x) => x.title)).toEqual(["ok"]);
    expect(r.report.template).toBe(1);
    expect(r.report.rowsRead).toBe(5);
    expect(r.report.skipped.map((s) => s.reason).join("|")).toMatch(/blank task/i);
    expect(r.report.skipped.map((s) => s.reason).join("|")).toMatch(/unknown brand/i);
    expect(r.report.skipped.map((s) => s.reason).join("|")).toMatch(/unknown division/i);
  });
  it("blank requester -> Wira + warning; unresolvable requester -> Wira + unmapped", () => {
    const r = req([reqRow({ Requester: "" }), reqRow({ Task: "B", Requester: "Zed" })]);
    expect(r.records.map((x) => x.requesterId)).toEqual(["u-wira", "u-wira"]);
    expect(r.report.warnings).toHaveLength(2);
    expect(r.report.unmapped).toEqual([{ row: 3, field: "Requester", value: "Zed" }]);
  });
  it("Daus resolves to inactive user without warning; unmapped designer -> null + unmapped + warning", () => {
    const a = req([reqRow({ Designer: "Daus" })]);
    expect(a.records[0].assigneeId).toBe("u-daus");
    expect(a.report.warnings).toHaveLength(0);
    const b = req([reqRow({ Designer: "Ghost" })]);
    expect(b.records[0].assigneeId).toBeNull();
    expect(b.report.unmapped).toEqual([{ row: 2, field: "Designer", value: "Ghost" }]);
    expect(b.report.warnings.length).toBeGreaterThan(0);
  });
  it("blank designer: no warning for Requested, warning for others", () => {
    expect(req([reqRow({ Designer: "", Progress: "Requested" })]).report.warnings).toHaveLength(0);
    expect(req([reqRow({ Designer: "", Progress: "Done" })]).report.warnings).toHaveLength(1);
  });
  it("unknown/blank progress -> REQUESTED with warning", () => {
    const r = req([reqRow({ Progress: "" , Designer: ""}), reqRow({ Task: "B", Progress: "Weird", Designer: "" })]);
    expect(r.records.map((x) => x.status)).toEqual(["REQUESTED", "REQUESTED"]);
    expect(r.report.warnings).toHaveLength(2);
  });
  it("Jumlah Output blank/invalid -> 1; Days Left/Request Time ignored", () => {
    const r = req([reqRow({ "Jumlah Output": "" }), reqRow({ Task: "B", "Jumlah Output": "abc" }), reqRow({ Task: "C", "Jumlah Output": "0" }), reqRow({ Task: "D", "Jumlah Output": "5" })]);
    expect(r.records.map((x) => x.outputCount)).toEqual([1, 1, 1, 5]);
    expect(r.report.warnings.join("|")).not.toMatch(/days left/i);
  });
  it("URLs: valid kept, invalid goes to notes", () => {
    const r = req([reqRow({ "Brief Link": "https://x.com/b", "Design Folder": "https://drive.google.com/f", Notes: "hi" }), reqRow({ Task: "B", "Brief Link": "see chat", "Design Folder": "D:\\folder", Notes: "" })]);
    expect(r.records[0]).toMatchObject({ briefUrl: "https://x.com/b", designFolderUrl: "https://drive.google.com/f", notes: "hi" });
    expect(r.records[1].briefUrl).toBeNull();
    expect(r.records[1].designFolderUrl).toBeNull();
    expect(r.records[1].notes).toContain("Brief: see chat");
    expect(r.records[1].notes).toContain("Folder: D:\\folder");
  });
  it("duplicate identical rows get distinct, stable keys", () => {
    const a = req([reqRow({}), reqRow({})]).records.map((x) => x.fields.importKey as string);
    expect(new Set(a).size).toBe(2);
    expect(a[1]).toBe(`${a[0]}#2`);
    const b = req([reqRow({}), reqRow({})]).records.map((x) => x.fields.importKey);
    expect(b).toEqual(a);
  });
  it("missing required headers -> clear error", () => {
    const hs = REQ_HEADERS.filter((h) => h !== "Task" && h !== "Brand");
    expect(() => req([], hs)).toThrow(/missing required header.*brand.*task/i);
  });
});

describe("parseRequestRows: socmed source", () => {
  it("m/d/yyyy dates; fields mapping; long headers matched tolerantly", () => {
    const r = soc([socRow({})]);
    const rec = r.records[0];
    expect(rec.requestedAt.toISOString()).toBe("2026-09-29T17:00:00.000Z"); // 9/30 Jakarta midnight
    expect(rec.deadline!.toISOString()).toBe("2026-09-30T17:00:00.000Z"); // 10/1
    expect(rec.requesterId).toBe("u-rifqy");
    expect(rec.assigneeId).toBe("u-fadli");
    expect(rec.typeName).toBe("Social Media");
    expect(rec.outputCount).toBe(3);
    expect(rec.fields).toMatchObject({ platform: "TikTok", contentType: "Campaign", shooting: true, upload: false, editing: true, importSource: "socmed" });
    expect(rec.fields.publishedUrl).toBeUndefined();
    expect(r.report.months).toEqual({ "2026-09": 1 }); // Month_Key ignored; derived from request date
  });
  it("4/6/2026 is April 6", () => {
    expect(soc([socRow({ "Otomatis Request Date": "4/6/2026" })]).records[0].requestedAt.toISOString()).toBe("2026-04-05T17:00:00.000Z");
    expect(soc([socRow({ "Otomatis Request Date": "30/9/2026" })]).records).toHaveLength(0);
  });
  it("Include_KPI", () => {
    const v = (x: string) => soc([socRow({ Include_KPI: x })]).records[0].includeKpi;
    expect([v("No"), v("false"), v("0"), v("Yes"), v("")]).toEqual([false, false, false, true, true]);
  });
  it("platform other -> omitted; contentType none -> omitted; Link Upload valid -> publishedUrl", () => {
    const rec = soc([socRow({ Platform: "YouTube", Notes: "nothing", "Link Upload": "https://tiktok.com/v/1" })]).records[0];
    expect(rec.fields.platform).toBeUndefined();
    expect(rec.fields.contentType).toBeUndefined();
    expect(rec.fields.publishedUrl).toBe("https://tiktok.com/v/1");
    expect(soc([socRow({ Notes: "story daily" })]).records[0].fields.contentType).toBe("Story");
  });
  it("missing requester header", () => {
    expect(() => soc([], SOC_HEADERS.filter((h) => !/requester/i.test(h)))).toThrow(/requester/i);
  });
  it("ignores derived columns even when numeric garbage", () => {
    const r = soc([row(SOC_HEADERS, { ...socRow({}), "Days Left": "-3", Month_Key: "garbage" })]);
    expect(r.records).toHaveLength(1);
  });
});

describe("fix round 1", () => {
  const SOC_CSV_HEADERS = SOC_HEADERS;
  it("swapped sources are rejected with zero records", () => {
    expect(() => req([socRow({})], SOC_CSV_HEADERS)).toThrow(/looks like the SocMed export.*second file/i);
    expect(() => soc([reqRow({})], REQ_HEADERS)).toThrow(/does not look like the SocMed Tracker export/i);
  });
  it("timestamp suffix accepted (date part only, strict format)", () => {
    const a = req([reqRow({ "Request Date": "04/06/2026 10:23", Deadline: "05/06/2026 9:05:01 PM" })]).records[0];
    expect(a.requestedAt.toISOString()).toBe("2026-06-03T17:00:00.000Z");
    expect(a.deadline!.toISOString()).toBe("2026-06-04T17:00:00.000Z");
    const b = soc([socRow({ "Otomatis Request Date": "4/6/2026 10:23:45", Deadline: "4/7/2026 10:23" })]).records[0];
    expect(b.requestedAt.toISOString()).toBe("2026-04-05T17:00:00.000Z");
    expect(b.deadline!.toISOString()).toBe("2026-04-06T17:00:00.000Z");
    expect(req([reqRow({ "Request Date": "04/06/2026 junk" })]).records).toHaveLength(0);
  });
  it("invalid non-blank Jumlah Output warns; blank is silent", () => {
    for (const v of ["2.0", "1,5", "-1", "abc", "0"]) {
      const r = req([reqRow({ "Jumlah Output": v })]);
      expect(r.records[0].outputCount).toBe(1);
      expect(r.report.warnings.some((w) => /Jumlah Output/.test(w.message))).toBe(true);
    }
    expect(req([reqRow({ "Jumlah Output": "" })]).report.warnings).toHaveLength(0);
  });
  it("report rows use real CSV line numbers (multi-line quoted cell)", async () => {
    const { readCsv } = await import("@/lib/import/csv");
    const csv = `${REQ_HEADERS.join(",")}\nRio,Clogent,Creative,A,,"line1\nline2",22/05/2026,,,,,Requested,,1\nRio,Clogent,Creative,B,,,99/99/2026,,,,,Requested,,1\n`;
    const { headers, rows, lines } = readCsv(csv);
    const r = parseRequestRows("requests", rows, ctx, headers, lines);
    expect(r.report.skipped).toEqual([{ row: 4, reason: expect.stringMatching(/request date/i) }]);
  });
  it("socmed warns on unknown platform / no contentType; word boundary for contentType", () => {
    const r = soc([socRow({ Platform: "", Notes: "brand HISTORY reel" })]);
    expect(r.records[0].fields.contentType).toBeUndefined();
    const msgs = r.report.warnings.map((w) => w.message).join("|");
    expect(msgs).toMatch(/Platform/);
    expect(msgs).toMatch(/contentType/);
    expect(soc([socRow({ Notes: "daily-post" })]).records[0].fields.contentType).toBe("Daily");
  });
  it("ambiguous names reported as ambiguous", () => {
    const amb = { ...ctx, users: [...ctx.users, { id: "u-x", name: "Rio", fullName: null, aliases: [], active: true }] };
    const r = parseRequestRows("requests", [reqRow({ Requester: "Rio", Designer: "Rio" })], amb, REQ_HEADERS);
    expect(r.report.warnings.map((w) => w.message).join("|")).toMatch(/ambiguous/);
    expect(r.report.warnings.map((w) => w.message).join("|")).not.toMatch(/not found/);
  });
});
