import { describe, it, expect } from "vitest";
import { parseCsv, parseTasks, planTaskSync, sheetDate } from "@/lib/designProjectSheet";
import { finalShare, productSummaries, stageCounts } from "@/lib/projectProgress";
import { cleanFileUrl, cleanTaskDate, dateOrderError, jakartaDay, jakartaIso } from "@/lib/projectTasks";

// Four header/grid rows, then the brand marker on sheet row 5, then tasks from row 6.
const HEAD = [
  "#,TASK TITLE,SUB TITLE,TASK OWNER,PROGRESS,START DATE,DUE DATE,File Document",
  ",,,,,,,,Jun,Jun",
  ",,,,,,,,25,26",
  ",,,,,,,,Thu,Fri",
];
const MARKER = "A,Clogent,,,,,,";

function sheet(...rows: string[]) {
  return [...HEAD, MARKER, ...rows].join("\n");
}

describe("parseTasks", () => {
  it("groups variants under the product title and reads every A-H column", () => {
    const rows = parseTasks(
      sheet(
        ",Shoe Foam,Regular,Emilia,Final Artwork,6/10/2026,8/24/2026,FA_SF.pdf",
        ",,Blue,Emilia,First Preview,6/10/2026,8/24/2026,",
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      position: 1,
      title: "Shoe Foam",
      subTitle: "Regular",
      ownerName: "Emilia",
      stage: "FINAL_ARTWORK",
      dueTbc: false,
      fileName: "FA_SF.pdf",
      notes: null,
    });
    // Variant row inherits the product title above it.
    expect(rows[1]).toMatchObject({ position: 2, title: "Shoe Foam", subTitle: "Blue", stage: "FIRST_PREVIEW", fileName: null });
  });

  it("keeps TBC due dates as null with the flag set, and the placeholder file as a note", () => {
    const [row] = parseTasks(sheet(",Batu Aroma,Regular,Emilia,First Preview,6/10/2026,TBC,Product Redesign"));
    expect(row).toMatchObject({ dueDate: null, dueTbc: true, fileName: null, notes: "Sheet file column: Product Redesign" });
  });

  it("attaches each file link to the task on the same sheet row, and leaves other rows without one", () => {
    const rows = parseTasks(
      sheet(
        ",Shoe Foam,Regular,Emilia,Final Artwork,6/10/2026,8/24/2026,FA_SF.pdf",
        ",,Blue,Emilia,First Preview,6/10/2026,8/24/2026,",
        ",Batu Aroma,Regular,Emilia,First Preview,6/10/2026,TBC,Product Redesign",
      ),
      new Map([
        [6, "https://drive.google.com/file/d/abc/view"], // sheet row 6 = first task
        [8, "https://docs.google.com/presentation/d/xyz/edit"], // sheet row 8 = third task
      ]),
    );
    expect(rows.map((r) => [r.sheetRow, r.fileUrl])).toEqual([
      [6, "https://drive.google.com/file/d/abc/view"],
      [7, null],
      [8, "https://docs.google.com/presentation/d/xyz/edit"],
    ]);
  });

  it("skips fully blank rows", () => {
    const rows = parseTasks(sheet(",,,,,,,", ",Shoe Foam,Regular,Emilia,Final Artwork,6/10/2026,8/24/2026,x.pdf", ",,,,,,,"));
    expect(rows).toHaveLength(1);
  });

  it("rejects an unknown progress label, naming the product", () => {
    expect(() => parseTasks(sheet(",Shoe Foam,Regular,Emilia,Done-ish,6/10/2026,8/24/2026,x.pdf"))).toThrow(
      'Unknown progress "Done-ish" on "Shoe Foam"',
    );
  });

  it("rejects a variant that has no product title above it", () => {
    expect(() => parseTasks(sheet(",,Blue,Emilia,First Preview,6/10/2026,8/24/2026,x.pdf"))).toThrow(/no product title above it/);
  });

  it("rejects a non-marker value in column A with its sheet row number", () => {
    // Grid starts at sheet row 6 for the first data row (index 5 in the file, after 4 header lines + marker).
    expect(() => parseTasks(sheet(`12,Shoe Foam,Regular,Emilia,Final Artwork,6/10/2026,8/24/2026,x.pdf`))).toThrow(
      /Sheet row 6: unexpected "12" in column A/,
    );
  });

  it("reports an unrecognised date instead of storing a wrong one", () => {
    expect(() => parseTasks(sheet(",Shoe Foam,Regular,Emilia,Final Artwork,2026-06-10,8/24/2026,x.pdf"))).toThrow(
      'Unrecognised date "2026-06-10"',
    );
  });
});

describe("sheetDate", () => {
  it("stores M/D/YYYY as Jakarta midnight (17:00 UTC the previous day)", () => {
    expect(sheetDate("6/10/2026")?.toISOString()).toBe("2026-06-09T17:00:00.000Z");
  });

  it("returns null for blank and TBC", () => {
    expect(sheetDate("")).toBeNull();
    expect(sheetDate("tbc")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("keeps commas and line breaks inside quoted cells and unescapes doubled quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi""\nthere",d')).toEqual([["a", "b, c", 'say "hi"\nthere', "d"]]);
  });
});

describe("project progress helpers", () => {
  const d = (s: string) => new Date(`${s}T00:00:00+07:00`);
  const tasks = [
    { title: "Shoe Foam", stage: "FINAL_ARTWORK" as const, status: null, startDate: d("2026-06-10"), dueDate: d("2026-08-24"), dueTbc: false },
    { title: "Shoe Foam", stage: "FIRST_PREVIEW" as const, status: null, startDate: d("2026-08-21"), dueDate: d("2026-09-01"), dueTbc: false },
    { title: "Batu Aroma", stage: "TECHNICAL_ARTWORK" as const, status: null, startDate: d("2026-06-10"), dueDate: null, dueTbc: true },
    { title: "Cloghome", stage: null, status: null, startDate: null, dueDate: null, dueTbc: false },
  ];

  it("counts variants per stage and keeps unstaged ones separate", () => {
    expect(stageCounts(tasks)).toEqual({ NOT_STARTED: 0, FIRST_PREVIEW: 1, MANUSCRIPT: 0, TECHNICAL_ARTWORK: 1, APPROVAL: 0, FINAL_ARTWORK: 1, CANCELLED: 0, none: 1 });
  });

  it("summarises each product in sheet order with its date span and TBC flag", () => {
    const [shoe, batu, cloghome] = productSummaries(tasks);
    expect(shoe).toMatchObject({ title: "Shoe Foam", variants: 2, finalCount: 1, dueTbc: false });
    expect(shoe.startDate?.toISOString()).toBe(d("2026-06-10").toISOString());
    expect(shoe.dueDate?.toISOString()).toBe(d("2026-09-01").toISOString());
    expect(batu).toMatchObject({ title: "Batu Aroma", variants: 1, finalCount: 0, dueDate: null, dueTbc: true });
    expect(cloghome).toMatchObject({ title: "Cloghome", variants: 1, startDate: null });
  });

  it("gives the share of variants at Final Artwork, and 0 for an empty project", () => {
    expect(finalShare(tasks)).toEqual({ done: 1, total: 4, percent: 25 });
    expect(finalShare([])).toEqual({ done: 0, total: 0, percent: 0 });
    // Canceled variants are not part of the live total.
    const withCancelled = [...tasks, { title: "Dropped", stage: "CANCELLED" as const, status: null, startDate: null, dueDate: null, dueTbc: false }];
    expect(finalShare(withCancelled)).toEqual({ done: 1, total: 4, percent: 25 });
  });
});

describe("planTaskSync", () => {
  const row = (title: string, subTitle: string | null, position: number) =>
    ({ sheetRow: position + 5, position, title, subTitle, ownerName: null, stage: "FIRST_PREVIEW" as const, status: null, startDate: null, dueDate: null, dueTbc: false, fileName: null, fileUrl: null, notes: null });

  it("updates matched variants, creates new ones, and reports variants no longer in the sheet", () => {
    const plan = planTaskSync(
      [
        { id: "v1", title: "Shoe Foam", subTitle: "Regular" },
        { id: "v2", title: "Shoe Foam", subTitle: "Blue" },
        { id: "v3", title: "Gone", subTitle: null },
      ],
      [row("Shoe Foam", "Regular", 1), row("Shoe Foam", "Blue", 2), row("Batu Aroma", "Regular", 3)],
    );
    expect(plan.update.map((u) => u.id)).toEqual(["v1", "v2"]);
    expect(plan.create.map((r) => r.title)).toEqual(["Batu Aroma"]);
    expect(plan.missing).toEqual([{ id: "v3", title: "Gone", subTitle: null }]);
  });

  it("treats a missing sub title as its own variant key", () => {
    const plan = planTaskSync([{ id: "v1", title: "Cloghome 400", subTitle: null }], [row("Cloghome 400", null, 1)]);
    expect(plan.update.map((u) => u.id)).toEqual(["v1"]);
  });

  it("refuses ambiguous keys rather than guessing", () => {
    expect(() => planTaskSync([{ id: "a", title: "X", subTitle: null }, { id: "b", title: "X", subTitle: null }], [])).toThrow(/share the name/);
    expect(() => planTaskSync([], [row("X", null, 1), row("X", null, 2)])).toThrow(/two rows/);
  });
});

describe("cleanFileUrl", () => {
  it("accepts http and https links, trimmed", () => {
    expect(cleanFileUrl("  https://drive.google.com/file/d/abc/view  ")).toBe("https://drive.google.com/file/d/abc/view");
    expect(cleanFileUrl("http://example.com/a")).toBe("http://example.com/a");
  });
  it("treats blank as clearing the link", () => {
    expect(cleanFileUrl("   ")).toBeNull();
  });
  it("rejects anything that is not a full http(s) link", () => {
    expect(cleanFileUrl("drive.google.com/file")).toBeUndefined();
    expect(cleanFileUrl("javascript:alert(1)")).toBeUndefined();
    expect(cleanFileUrl("https://")).toBeUndefined();
    expect(cleanFileUrl("https://x.com/" + "a".repeat(2100))).toBeUndefined();
  });
});

describe("cleanTaskDate", () => {
  it("accepts real calendar days and treats blank as clearing", () => {
    expect(cleanTaskDate(" 2026-06-10 ")).toBe("2026-06-10");
    expect(cleanTaskDate("2028-02-29")).toBe("2028-02-29");
    expect(cleanTaskDate("")).toBeNull();
  });
  it("rejects impossible or badly formatted dates", () => {
    expect(cleanTaskDate("2026-02-30")).toBeUndefined();
    expect(cleanTaskDate("10/06/2026")).toBeUndefined();
    expect(cleanTaskDate("2026-6-1")).toBeUndefined();
  });
  it("round-trips a Jakarta day through the stored instant", () => {
    expect(jakartaIso(jakartaDay("2026-11-27"))).toBe("2026-11-27");
  });
});

describe("dateOrderError", () => {
  it("allows equal, later and missing dates", () => {
    expect(dateOrderError("2026-06-10", "2026-06-10")).toBeUndefined();
    expect(dateOrderError("2026-06-10", "2026-07-01")).toBeUndefined();
    expect(dateOrderError(null, "2026-07-01")).toBeUndefined();
    expect(dateOrderError("2026-06-10", null)).toBeUndefined();
  });
  it("flags a due date before the start date", () => {
    expect(dateOrderError("2026-06-10", "2026-06-09")).toMatch(/can't be before/);
  });
});
