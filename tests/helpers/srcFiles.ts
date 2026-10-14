import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const SKIPPED_DIRS = new Set(["node_modules", ".next"]);

/** Every file under `dir` (recursive, skipping node_modules and .next) whose name matches `ext`. */
export function srcFiles(dir: string, ext: RegExp = /\.(ts|tsx)$/): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d).sort()) {
      if (SKIPPED_DIRS.has(entry)) continue;
      const p = path.join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (ext.test(entry)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export type JsxOpening = { file: string; line: number; attrs: string[] };

/**
 * Every `<Tag ...>` / `<Tag ... />` in `files`, with its 1-based line and attribute names.
 * A spread attribute (`{...props}`) is listed as "...".
 */
export function jsxOpenings(tag: string, files: string[]): JsxOpening[] {
  const found: JsxOpening[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === tag) {
        const attrs = node.attributes.properties.map((a) => (ts.isJsxAttribute(a) ? a.name.getText(sf) : "..."));
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        found.push({ file, line, attrs });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}
