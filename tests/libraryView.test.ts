import { describe, it, expect } from "vitest";
import { linkKind, itemBadge, filterRows, type LibraryRow } from "@/lib/libraryView";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-10T05:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("linkKind", () => {
  it("Google Docs document", () =>
    expect(linkKind("https://docs.google.com/document/d/abc/edit")).toBe("docs"));
  it("Google Sheets", () =>
    expect(linkKind("https://docs.google.com/spreadsheets/d/abc/edit")).toBe("sheets"));
  it("Google Slides", () =>
    expect(linkKind("https://docs.google.com/presentation/d/abc/edit")).toBe("slides"));
  it("Drive", () => expect(linkKind("https://drive.google.com/drive/folders/x")).toBe("drive"));
  it("Figma", () => expect(linkKind("https://www.figma.com/file/abc")).toBe("figma"));
  it("Figma without www", () => expect(linkKind("https://figma.com/file/abc")).toBe("figma"));
  it("Canva", () => expect(linkKind("https://www.canva.com/design/abc")).toBe("canva"));
  it("PDF ignores case and query", () =>
    expect(linkKind("https://example.com/files/Guide.PDF?x=1")).toBe("pdf"));
  it("other hosts are web", () => expect(linkKind("https://example.com/page")).toBe("web"));
  it("malformed is web", () => expect(linkKind("not a url")).toBe("web"));
});

describe("itemBadge", () => {
  it("never edited, 2 days ago is New", () => {
    const d = ago(2 * DAY);
    expect(itemBadge({ createdAt: d, contentUpdatedAt: d }, now)).toBe("New · 8 Oct");
  });
  it("edited 13 days ago is Updated", () => {
    const edited = ago(13 * DAY);
    const created = ago(30 * DAY);
    expect(itemBadge({ createdAt: created, contentUpdatedAt: edited }, now)).toBe("Updated · 27 Sept");
  });
  it("exactly 14 days is shown", () => {
    const d = ago(14 * DAY);
    expect(itemBadge({ createdAt: d, contentUpdatedAt: d }, now)).not.toBeNull();
  });
  it("15 days is null", () => {
    const d = ago(15 * DAY);
    expect(itemBadge({ createdAt: d, contentUpdatedAt: d }, now)).toBeNull();
  });
  it("edited after creation but not in window is null", () => {
    expect(
      itemBadge({ createdAt: ago(30 * DAY), contentUpdatedAt: ago(20 * DAY) }, now),
    ).toBeNull();
  });
  it("formats the date in Jakarta time", () => {
    // 2026-10-02T20:00Z is 3 Oct 03:00 Jakarta
    const d = new Date("2026-10-02T20:00:00Z");
    const n = new Date("2026-10-03T12:00:00Z");
    expect(itemBadge({ createdAt: d, contentUpdatedAt: d }, n)).toBe("New · 3 Oct");
  });
});

function row(p: Partial<LibraryRow> & { id: string }): LibraryRow {
  return {
    title: "Untitled",
    url: "https://example.com/x",
    description: null,
    categoryId: "cat-1",
    brandId: null,
    brandName: null,
    pinned: false,
    sortOrder: 0,
    createdAt: now,
    contentUpdatedAt: now,
    ...p,
  };
}

describe("filterRows", () => {
  const rows = [
    row({ id: "a", title: "Brand Logo Pack", categoryId: "cat-1", brandId: "b-1" }),
    row({ id: "b", title: "Box spec", description: "NG (2026) sizes", categoryId: "cat-2", brandId: "b-1" }),
    row({ id: "c", title: "Deck", url: "https://www.Figma.com/file/z", categoryId: "cat-2", brandId: "b-2" }),
  ];
  const all = { q: "", categoryId: null, brandId: null };

  it("empty query returns all rows", () => expect(filterRows(rows, all)).toHaveLength(3));
  it("whitespace-only query returns all rows", () =>
    expect(filterRows(rows, { ...all, q: "   " })).toHaveLength(3));
  it("matches title case-insensitively", () =>
    expect(filterRows(rows, { ...all, q: "LOGO" }).map((r) => r.id)).toEqual(["a"]));
  it("matches description", () =>
    expect(filterRows(rows, { ...all, q: "ng (2026)" }).map((r) => r.id)).toEqual(["b"]));
  it("matches URL host", () =>
    expect(filterRows(rows, { ...all, q: "figma" }).map((r) => r.id)).toEqual(["c"]));
  it("does not treat the query as a RegExp", () =>
    expect(() => filterRows(rows, { ...all, q: "NG (2026" })).not.toThrow());
  it("category filter", () =>
    expect(filterRows(rows, { ...all, categoryId: "cat-2" }).map((r) => r.id)).toEqual(["b", "c"]));
  it("brand filter", () =>
    expect(filterRows(rows, { ...all, brandId: "b-1" }).map((r) => r.id)).toEqual(["a", "b"]));
  it("category and brand AND together", () =>
    expect(filterRows(rows, { ...all, categoryId: "cat-2", brandId: "b-1" }).map((r) => r.id)).toEqual(["b"]));
  it("query AND filters", () =>
    expect(filterRows(rows, { q: "box", categoryId: "cat-1", brandId: null })).toEqual([]));
  it("falls back to raw url when it is malformed", () => {
    const r = [row({ id: "m", title: "t", url: "bad host/thing" })];
    expect(filterRows(r, { ...all, q: "host/thing" }).map((x) => x.id)).toEqual(["m"]);
  });
});
