import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { srcFiles } from "./helpers/srcFiles";

/** Kit components replaced by shadcn ones (see src/components/ui/README.md). Each migration task appends its names. */
const REMOVED = ["Button", "IconButton", "Field", "Card", "Chip", "Alert", "Skeleton", "Divider", "table"];

const root = path.resolve(__dirname, "..");
const files = [...srcFiles(path.join(root, "src")), ...srcFiles(path.join(root, "tests"))].filter((f) => f !== __filename);

describe("removed kit files", () => {
  it("removed kit files stay removed", () => {
    for (const name of REMOVED) {
      for (const ext of [".tsx", ".ts"]) {
        expect(existsSync(path.join(root, "src/components/ui", `${name}${ext}`)), `${name}${ext} is back`).toBe(false);
      }
    }
  });

  it("nothing imports a removed kit file", () => {
    const importRe = new RegExp(`from\\s+["'][^"']*\\bui/(?:${REMOVED.join("|")})["']|from\\s+["']\\./(?:${REMOVED.join("|")})["']`);
    const offenders = files.filter((f) => importRe.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });
});
