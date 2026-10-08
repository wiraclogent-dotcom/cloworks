import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readMasterWorkbook } from "@/lib/import/readWorkbook";
import { parseMaster } from "@/lib/import/parseMaster";
import { inferBrands } from "@/lib/import/inferBrands";
import { parseRequestRows, parseDimasRows, statusChain, type ImportRecord } from "@/lib/import/parseRequests";
import { formatReport } from "@/lib/import/run";
import { users, brands, divisions, REQ_HEADERS, SOC_HEADERS, reqRow, socRow } from "./fixtures";
import { buildFixtureWorkbook, DIMAS_LOG } from "./xlsxFixtures";

const ctx = {
  users: [
    ...users,
    { id: "u-syahda", name: "Syahda", fullName: "Syahda Niswah", aliases: [], active: true },
    { id: "u-dimas", name: "Dimas Pandu", fullName: "Dimas Pandu Wicaksono", aliases: [], active: true },
  ],
  brands,
  divisions,
};

let fx: Awaited<ReturnType<typeof buildFixtureWorkbook>>;
let parsed: ReturnType<typeof parseMaster>;
beforeAll(async () => {
  fx = await buildFixtureWorkbook();
  parsed = parseMaster(await readMasterWorkbook(fx.file), ctx);
});
afterAll(() => fx?.cleanup());
const rec = (source: string, title: string) => parsed.records.find((r) => r.source === source && r.title === title)!;
const rep = (source: string) => parsed.reports.find((r) => r.source === source)!;

describe("parseMaster: requests + socmed from the workbook", () => {
  it("counts: template skipped, everything else imported", () => {
    expect(rep("requests")).toMatchObject({ rowsRead: 7, importable: 6, template: 1 });
    expect(rep("socmed")).toMatchObject({ rowsRead: 4, importable: 4, template: 0 });
  });
  it("URL columns win; labels are kept in notes; label equal to URL adds nothing", () => {
    const a = rec("requests", "Banner Promo");
    expect(a.briefUrl).toBe("https://example.com/brief/AAA");
    expect(a.designFolderUrl).toBe("https://example.com/folder/FFF");
    expect(a.notes).toBe("Mohon cepat\nBrief: Brief Banner\nFolder: Folder Banner");
    const r = rec("requests", "Rich Notes");
    expect(r.briefUrl).toBe("https://example.com/s/abc");
    expect(r.notes).toBe("Hello World\nFolder: Folder with space"); // brief label == URL: no note; bad folder target dropped, label kept
    expect(r.designFolderUrl).toBeNull();
    const m = rec("requests", "Mailto Link");
    expect([m.briefUrl, m.designFolderUrl, m.notes]).toEqual([null, null, "Brief: mail me\nFolder: evil\nRequester (as typed): Ibnu"]);
  });
  it("socmed Link Upload URL -> fields.publishedUrl; Design Folder URL used", () => {
    const s = rec("socmed", "Short Video A");
    expect(s.fields.publishedUrl).toBe("https://example.com/post/1");
    expect(s.designFolderUrl).toBe("https://example.com/s/2bVjw");
    expect(s.briefUrl).toBe("https://example.com/brief/BBB");
    expect(s.notes).toBe("CAMPAIGN CONTENT\nBrief: Content Plan");
    expect(s.typeName).toBe("Social Media");
    expect(s.fields).toMatchObject({ platform: "TikTok", contentType: "Campaign", shooting: true, upload: true, editing: true });
    expect(rec("socmed", "Story C").includeKpi).toBe(false);
  });
  it("real dates: 4 June vs 6 April, month-end request stays in September", () => {
    expect(rec("requests", "Banner Promo").requestedAt.toISOString()).toBe("2026-06-03T17:00:00.000Z");
    expect(rec("requests", "Label Refill").requestedAt.toISOString()).toBe("2026-04-05T17:00:00.000Z");
    expect(rec("requests", "Poster Akhir Bulan").requestedAt.toISOString()).toBe("2026-09-29T17:00:00.000Z");
    expect(rec("socmed", "Short Video A").requestedAt.toISOString()).toBe("2026-09-29T17:00:00.000Z");
    expect(rep("requests").months).toEqual({ "2026-04": 1, "2026-06": 1, "2026-07": 3, "2026-09": 1 });
    expect(rep("requests").samples[0]).toMatchObject({ requestRaw: "04/06/2026", requestIso: "2026-06-04" });
  });
  it("unresolved requester (nickname / not in roster): kept, Wira, note, unmapped; blank requester: Wira, no note", () => {
    const y = rec("requests", "Poster Akhir Bulan");
    expect(y.requesterId).toBe("u-wira");
    expect(y.notes).toBe("Requester (as typed): Yoel");
    expect(rep("requests").unmapped.map((u) => u.value).sort()).toEqual(["Ibnu", "Yoel"]);
    const b = rec("requests", "Blank requester");
    expect([b.requesterId, b.notes]).toEqual(["u-wira", "Brief: frag"]);
  });
  it("legacy CSV-shaped rows (no URL columns) still behave as before, plus the requester note", () => {
    const r = parseRequestRows("requests", [reqRow({ Requester: "Iyok", "Brief Link": "label only", "Design Folder": "https://example.com/x" })], ctx, REQ_HEADERS).records[0];
    expect([r.briefUrl, r.designFolderUrl]).toEqual([null, "https://example.com/x"]);
    expect(r.notes).toBe("Brief: label only\nRequester (as typed): Iyok");
  });
  it("notes stay <= 5000 chars and keep the requester note", () => {
    const r = parseRequestRows("requests", [reqRow({ Requester: "Iyok", Notes: "x".repeat(6000) })], ctx, REQ_HEADERS).records[0];
    expect(r.notes!.length).toBeLessThanOrEqual(5000);
    expect(r.notes!.endsWith("Requester (as typed): Iyok")).toBe(true);
  });
});

describe("parseMaster: Dimas Tracker", () => {
  const dim = () => parsed.records.filter((r) => r.source === "dimas");
  it("one task per log row, blank file names skipped silently", () => {
    expect(dim()).toHaveLength(DIMAS_LOG.length);
    expect(rep("dimas")).toMatchObject({ importable: DIMAS_LOG.length, template: 0, dateFormat: "mdy" });
    expect(rep("dimas").skipped).toEqual([]);
    expect(rep("dimas").rowsRead).toBe(DIMAS_LOG.length + 1);
  });
  it("mapping: type, division, designer, status, dates, notes, fields", () => {
    const r = dim()[0];
    expect(r).toMatchObject({
      title: "FAFA 12 SEPT 1", typeName: "Motion Support", divisionId: "d-social", assigneeId: "u-dimas", status: "DONE",
      deadline: null, outputCount: 1, includeKpi: true, briefUrl: null, designFolderUrl: null,
    });
    expect(r.requestedAt.toISOString()).toBe("2026-09-16T17:00:00.000Z");
    expect(r.fields).toMatchObject({ shooting: true, editing: true, upload: false, importSource: "dimas" });
    expect(r.fields.importKey).toMatch(/^[0-9a-f]{40}$/);
    expect(r.notes).toBe("Video/motion edit logged in Dimas Tracker.\nBrand not recorded in Dimas Tracker; inferred Bubble Wash.");
    const ev = statusChain(r);
    expect(ev.map((e) => e.to)).toEqual(["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE"]);
    expect(new Set(ev.map((e) => e.at.toISOString()))).toEqual(new Set([r.requestedAt.toISOString()]));
    expect(ev.every((e) => e.actorId === "u-dimas")).toBe(true);
  });
  it("requester from the first word: FAFA, SYAHDA, RIO; others -> Wira + warning, not 'unmapped'", () => {
    const by = (t: string) => dim().filter((r) => r.title === t);
    expect(by("FAFA 12 SEPT 2")[0].requesterId).toBe("u-fafa");
    expect(by("SYAHDA 28 SEPT 1")[0].requesterId).toBe("u-syahda");
    expect(by("RIO 12 SEPT 1")[0].requesterId).toBe("u-rio");
    expect(by("MOTION DEMO").map((r) => r.requesterId)).toEqual(["u-wira", "u-wira", "u-wira"]);
    expect(by("RESIZE KONTEN DEMO")[0].requesterId).toBe("u-wira");
    expect(rep("dimas").warnings.filter((w) => /requester not recorded/i.test(w.message))).toHaveLength(5);
    expect(rep("dimas").unmapped).toEqual([]);
    expect(by("MOTION DEMO")[0].notes).not.toMatch(/as typed/);
    expect(by("MOTION DEMO")[0].notes).toContain("Requester not recorded in Dimas Tracker; Wira used.");
    expect(by("FAFA 12 SEPT 1")[0].notes).not.toContain("Requester not recorded");
    expect(rep("dimas").warnings.some((w) => w.message.includes('"MOTION DEMO"'))).toBe(true);
  });
  it("duplicate file names are separate tasks with distinct keys (counter on same name + date)", () => {
    const keys = dim().filter((r) => r.title === "MOTION DEMO").map((r) => r.fields.importKey);
    expect(new Set(keys).size).toBe(3);
    const same = dim().filter((r) => r.title === "RESIZE KONTEN DEMO").map((r) => r.fields.importKey); // same name AND same date
    expect(same[1]).toBe(`${same[0]}#2`);
    expect(new Set(dim().map((r) => r.fields.importKey)).size).toBe(DIMAS_LOG.length);
  });
  it("brand inference: Fafa -> Bubble Wash (majority); Syahda none, Rio tie, Wira -> Clogent; counts + report line", () => {
    const brandOf = (t: string) => brands.find((b) => b.id === dim().find((r) => r.title === t)!.brandId)!.name;
    expect(brandOf("FAFA 12 SEPT 1")).toBe("Bubble Wash");
    expect(brandOf("SYAHDA 28 SEPT 1")).toBe("Clogent");
    expect(brandOf("RIO 12 SEPT 1")).toBe("Clogent");
    expect(brandOf("MOTION DEMO")).toBe("Clogent");
    expect(dim().every((r) => /Brand not recorded in Dimas Tracker; inferred (Clogent|Bubble Wash)\.$/.test(r.notes!))).toBe(true);
    expect(rep("dimas").brandInferred).toBe(DIMAS_LOG.length);
    expect(formatReport(rep("dimas")).join("\n")).toMatch(/brand inferred: 9/);
    expect(formatReport(rep("requests")).join("\n")).toMatch(/links:\s+brief \d+, folder \d+, published \d+/);
  });
  it("invalid / blank date -> skipped with reason; blank file name silent", () => {
    const hdr = ["No", "Tanggal", "Nam File", "Shooting", "Upload", "Editing"];
    const rows = [
      { No: "1", Tanggal: "", "Nam File": "RIO 1", Shooting: "TRUE", Upload: "", Editing: "TRUE" },
      { No: "2", Tanggal: "13/45/2026", "Nam File": "RIO 2", Shooting: "TRUE", Upload: "", Editing: "TRUE" },
      { No: "3", Tanggal: "9/1/2026", "Nam File": "  ", Shooting: "", Upload: "", Editing: "" },
    ];
    const p = parseDimasRows(rows, ctx, hdr, [5, 6, 7]);
    expect(p.records).toHaveLength(0);
    expect(p.report.skipped.map((x) => [x.row, x.reason.replace(/".*"/, "X")])).toEqual([[5, "Invalid date X"], [6, "Invalid date X"]]);
  });
});

describe("inferBrands (pure)", () => {
  const mk = (over: Partial<ImportRecord>): ImportRecord => ({
    source: "requests", row: 1, title: "t", briefUrl: null, notes: null, brandId: "b-clogent", divisionId: "d-social", typeName: "x",
    requesterId: "u-a", assigneeId: null, requestedAt: new Date(0), deadline: null, status: "DONE", outputCount: 1, includeKpi: true,
    designFolderUrl: null, fields: { importKey: "k", importSource: "requests" }, ...over,
  });
  const dimas = (id: string, requesterId: string) => mk({ source: "dimas", requesterId, title: id, notes: "base", typeName: "Motion Support", fields: { importKey: id, importSource: "dimas" } });
  it("most common brand per requester", () => {
    const others = [mk({ brandId: "b-bw" }), mk({ brandId: "b-bw" }), mk({ brandId: "b-clogent" }), mk({ requesterId: "u-b", brandId: "b-clogent" })];
    const r = inferBrands([dimas("d1", "u-a"), dimas("d2", "u-b")], others, brands);
    expect(r.records.map((x) => x.brandId)).toEqual(["b-bw", "b-clogent"]);
    expect(r.records[0].notes).toBe("base\nBrand not recorded in Dimas Tracker; inferred Bubble Wash.");
    expect(r.inferred).toBe(2);
  });
  it("tie -> Clogent; no records -> Clogent; does not mutate inputs", () => {
    const others = [mk({ brandId: "b-bw" }), mk({ brandId: "b-clogent" }), mk({ brandId: "b-bw", requesterId: "u-c" })];
    const d = [dimas("d1", "u-a"), dimas("d2", "u-none"), dimas("d3", "u-c")];
    const r = inferBrands(d, others, brands);
    expect(r.records.map((x) => x.brandId)).toEqual(["b-clogent", "b-clogent", "b-bw"]);
    expect(d[0].notes).toBe("base");
  });
  it("requester not recorded (Wira fallback): Wira's own records are NOT used, straight to Clogent", () => {
    const others = [mk({ requesterId: "u-wira", brandId: "b-bw" }), mk({ requesterId: "u-wira", brandId: "b-bw" })];
    const notRecorded = { ...dimas("d1", "u-wira"), requesterRecorded: false };
    const recorded = dimas("d2", "u-wira");
    const r = inferBrands([notRecorded, recorded], others, brands);
    expect(r.records.map((x) => x.brandId)).toEqual(["b-clogent", "b-bw"]);
    expect(r.records[0].notes).toBe("base\nBrand not recorded in Dimas Tracker; inferred Clogent.");
  });
  it("ignores dimas-source records among 'others'", () => {
    const r = inferBrands([dimas("d1", "u-a")], [mk({ source: "dimas", brandId: "b-bw" })], brands);
    expect(r.records[0].brandId).toBe("b-clogent");
  });
});

describe("template rows and URL hygiene", () => {
  const soc = (rows: Record<string, string>[]) => parseRequestRows("socmed", rows, ctx, SOC_HEADERS);
  it("SocMed example row 'ISI DENGAN JUDUL COVER/CONTENT' is a template; 'Isi konten promo' is not", () => {
    const r = soc([socRow({ Task: "ISI DENGAN JUDUL COVER/CONTENT" }), socRow({ Task: "  isi   dengan judul lain" }), socRow({ Task: "Isi konten promo" }), socRow({ Task: "Isi dengan" })]);
    expect(r.report.template).toBe(2);
    expect(r.records.map((x) => x.title)).toEqual(["Isi konten promo", "Isi dengan"]);
  });
  const reqOne = (o: Record<string, string>) => parseRequestRows("requests", [reqRow(o)], ctx, [...REQ_HEADERS, "Brief Link URL", "Design Folder URL"].filter((h, i, a) => a.indexOf(h) === i)).records[0];
  it("rejects credentials, whitespace/control chars and >2048 chars (URL column and label cell); label goes to notes", () => {
    const long = "https://example.com/" + "a".repeat(2100);
    const r = reqOne({ "Brief Link": "https://user:pw@example.com/x", "Design Folder": "https://example.com/a b", Notes: "" });
    expect([r.briefUrl, r.designFolderUrl]).toEqual([null, null]);
    expect(r.notes).toBe("Brief: https://user:pw@example.com/x\nFolder: https://example.com/a b");
    const c = reqOne({ "Brief Link": "label", "Brief Link URL": "https://example.com/x\u0007y", "Design Folder": long });
    expect([c.briefUrl, c.designFolderUrl]).toEqual([null, null]);
    const u = reqOne({ "Brief Link": "label", "Brief Link URL": "https://:pw@example.com/x" });
    expect(u.briefUrl).toBeNull();
    const ok = reqOne({ "Brief Link": "https://example.com/" + "a".repeat(2000) });
    expect(ok.briefUrl).not.toBeNull();
  });
  it("published URL gets the same checks", () => {
    const bad = soc([socRow({ "Link Upload": "https://user:pw@example.com/p" }), socRow({ Task: "T2", "Link Upload": "https://example.com/p" })]);
    expect(bad.records[0].fields.publishedUrl).toBeUndefined();
    expect(bad.records[1].fields.publishedUrl).toBe("https://example.com/p");
  });
});

describe("Dimas first-token requester matching", () => {
  const hdr = ["No", "Tanggal", "Nam File", "Shooting", "Upload", "Editing"];
  const run = (names: string[]) => parseDimasRows(names.map((n, i) => ({ No: String(i), Tanggal: "9/1/2026", "Nam File": n, Shooting: "", Upload: "", Editing: "" })), ctx, hdr).records.map((r) => r.requesterId);
  it("splits on whitespace, _ - . but needs a whole-token match", () => {
    expect(run(["FAFA_12SEPT", "FAFA-12 SEPT", "syahda.5", "Rio_1", "RIOT 3", "FAFAYO 2", "RIO12 4"])).toEqual(["u-fafa", "u-fafa", "u-syahda", "u-rio", "u-wira", "u-wira", "u-wira"]);
  });
});
