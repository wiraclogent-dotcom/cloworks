import { describe, it, expect } from "vitest";
import { extractToc, slugifyHeading } from "@/lib/help/toc";

describe("slugifyHeading", () => {
  it("lowercases, trims, and joins words with dashes", () => {
    expect(slugifyHeading("  Steps for ops!  ")).toBe("steps-for-ops");
  });
});

describe("extractToc", () => {
  it("extracts ## and ### headings with levels and ids", () => {
    expect(extractToc("## Steps for ops\n\ntext\n\n### Detail\n")).toEqual([
      { level: 2, text: "Steps for ops", id: "steps-for-ops" },
      { level: 3, text: "Detail", id: "detail" },
    ]);
  });

  it("ignores single-hash headings", () => {
    expect(extractToc("# Title\n\n## Real")).toEqual([{ level: 2, text: "Real", id: "real" }]);
  });

  it("ignores ## lines inside a fenced code block", () => {
    const body = "## Before\n\n```md\n## Not a heading\n```\n\n## After";
    expect(extractToc(body).map((e) => e.text)).toEqual(["Before", "After"]);
  });
});
