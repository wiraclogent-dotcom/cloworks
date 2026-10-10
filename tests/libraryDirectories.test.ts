import { describe, it, expect } from "vitest";
import { parseMasterBox, parsePackaging, type DirCell } from "@/lib/import/libraryDirectories";

const c = (text: string, url = ""): DirCell => ({ text, url });

describe("parseMasterBox", () => {
  it("one item per box: PDF as the link, AI as a file, configuration · size as the description", () => {
    const items = parseMasterBox([
      { Produk: c("Box Laundry Pods"), Konfigurasi: c("12gr x 1100pods x 1box"), Ukuran: c("55 × 34,5 × 20cm"), "Link PDF": c("LAUNDRY PODS.pdf", "https://d.test/pdf"), "Link AI": c("LAUNDRY PODS.ai", "https://d.test/ai") },
      { Produk: c("Box Waterproof Spray 200 ml"), Konfigurasi: c("Unknown"), Ukuran: c("42,4 × 32,5 × 18,5cm"), "Link PDF": c("x.pdf", "https://d.test/p2"), "Link AI": c("") },
      { Produk: c("No links"), Konfigurasi: c("a"), Ukuran: c("b"), "Link PDF": c(""), "Link AI": c("") },
      { Produk: c(""), Konfigurasi: c(""), Ukuran: c(""), "Link PDF": c(""), "Link AI": c("") },
    ]);
    expect(items).toEqual([
      { title: "Box Laundry Pods", description: "12gr x 1100pods x 1box · 55 × 34,5 × 20cm", url: "https://d.test/pdf", files: [{ label: "AI", url: "https://d.test/ai" }] },
      { title: "Box Waterproof Spray 200 ml", description: "42,4 × 32,5 × 18,5cm", url: "https://d.test/p2", files: [] },
    ]);
  });

  it("falls back to the AI file as the main link when there is no PDF", () => {
    const [item] = parseMasterBox([{ Produk: c("Box X"), Konfigurasi: c(""), Ukuran: c(""), "Link PDF": c(""), "Link AI": c("x.ai", "https://d.test/ai") }]);
    expect(item).toMatchObject({ url: "https://d.test/ai", files: [], description: undefined });
  });
});

describe("parsePackaging", () => {
  const row = (o: Partial<Record<string, DirCell>>) => ({
    Brand: c("Clogent"), "Product Name": c("Laundry Pods"), Fragrance: c("Rose"), Konfigurasi: c("4 Pods"), Netto: c("48gr"), "Packaging Type": c("Pouch"),
    "Link PDF": c("a.pdf", "https://d.test/pdf"), "Link AI": c("a.ai", "https://d.test/ai"), Mockup: c("m.png", "https://d.test/m"), "New Design": c("n.pdf", "https://d.test/n"), ...o,
  });

  it("names the product variant, tags the brand and keeps every other file as a chip", () => {
    expect(parsePackaging([row({})])).toEqual([{
      title: "Laundry Pods – Rose · 4 Pods", description: "48gr · Pouch", brand: "Clogent", url: "https://d.test/pdf",
      files: [{ label: "AI", url: "https://d.test/ai" }, { label: "Mockup", url: "https://d.test/m" }, { label: "New design", url: "https://d.test/n" }],
    }]);
  });

  it("uses the first file available as the main link and skips rows without any", () => {
    const items = parsePackaging([
      row({ Fragrance: c(""), "Link PDF": c(""), "Link AI": c("") }),
      row({ "Product Name": c("Empty"), "Link PDF": c(""), "Link AI": c(""), Mockup: c(""), "New Design": c("") }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Laundry Pods · 4 Pods", url: "https://d.test/m", files: [{ label: "New design", url: "https://d.test/n" }] });
  });

  it("adds the netto to titles that would otherwise repeat", () => {
    const items = parsePackaging([
      row({ "Product Name": c("Underwear Detergent"), Konfigurasi: c(""), Netto: c("100ml") }),
      row({ "Product Name": c("Underwear Detergent"), Konfigurasi: c(""), Netto: c("500ml") }),
      row({ "Product Name": c("Shoe Foam"), Konfigurasi: c(""), Netto: c("150ml") }),
    ]);
    expect(items.map((i) => i.title)).toEqual(["Underwear Detergent – Rose · 100ml", "Underwear Detergent – Rose · 500ml", "Shoe Foam – Rose"]);
  });

  it("ignores pasted file names that are not real web addresses", () => {
    const [item] = parsePackaging([row({ "Link PDF": c(""), "Link AI": c("x.ai", "http://fa_clogent_air_purifier_bag_75gr_grey.ai/") })]);
    expect(item.url).toBe("https://d.test/m");
    expect(item.files.map((f) => f.label)).toEqual(["New design"]);
  });
});
