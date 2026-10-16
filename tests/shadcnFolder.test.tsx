import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { srcFiles } from "./helpers/srcFiles";

const dir = path.resolve(__dirname, "../src/components/shadcn");
const files = srcFiles(dir, /\.tsx$/);

it("the shadcn folder has component files to guard", () => {
  expect(files.length).toBeGreaterThan(0);
});

describe.each(files.map((f) => [path.basename(f), readFileSync(f, "utf8")] as const))("shadcn/%s", (_name, source) => {
  it("uses no tw-animate-css utilities", () => {
    expect(source).not.toMatch(/animate-in|animate-out|fade-in|fade-out|zoom-in|zoom-out|slide-in-from|slide-out-to/);
  });

  it("has no dark: variants", () => {
    expect(source).not.toMatch(/\bdark:/);
  });

  it("uses tokens, not literal colours", () => {
    expect(source).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b|\b(?:bg|text|border|ring|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(?:-\d+)?\b/,
    );
  });

  it("keeps our focus ring, not shadcn's 3px ring", () => {
    expect(source).not.toMatch(/ring-\[3px\]/);
  });

  it("imports cn from @/components/ui/cn", () => {
    if (!/\bcn\(/.test(source)) return;
    expect(source).toMatch(/import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*["']@\/components\/ui\/cn["']/);
  });
});
