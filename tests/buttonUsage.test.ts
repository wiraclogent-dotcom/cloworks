import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { srcFiles, jsxOpenings } from "./helpers/srcFiles";

const src = path.resolve(__dirname, "../src");
const files = srcFiles(src);

describe("Button usage", () => {
  it("every <Button> passes an explicit variant", () => {
    // shadcn's default variant is the primary look; the old kit default was the outline look. Never rely on a default.
    const missing = jsxOpenings("Button", files)
      .filter((o) => !o.attrs.includes("variant") && !o.attrs.includes("..."))
      .map((o) => `${path.relative(src, o.file)}:${o.line}`);
    expect(missing).toEqual([]);
  });

  it("buttonClass is gone", () => {
    const users = files.filter((f) => /\bbuttonClass\(/.test(readFileSync(f, "utf8"))).map((f) => path.relative(src, f));
    expect(users).toEqual([]);
  });
});
