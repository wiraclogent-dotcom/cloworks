import { describe, expect, it } from "vitest";
import { artSources, artUrl } from "@/lib/brand/art";

describe("brand art urls", () => {
  it("builds an auto-format Cloudinary url at a width", () => {
    expect(artUrl("demo", "hero", 800)).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_800/clowork/brand/hero");
  });

  it("offers widths up to 2x the display width", () => {
    const { src, srcSet } = artSources("demo", "empty-requests", 160);
    expect(src).toContain("w_160/");
    expect(srcSet.split(", ").map((s) => s.split(" ")[1])).toEqual(["160w", "240w", "320w"]);
  });

  it("never asks for more than the master width", () => {
    const { src, srcSet } = artSources("demo", "empty-requests", 800);
    expect(src).toContain("w_800/");
    expect(srcSet.endsWith("w_1024/clowork/brand/empty-requests 1024w")).toBe(true);
  });
});
