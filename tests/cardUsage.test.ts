import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { srcFiles } from "./helpers/srcFiles";

const src = path.resolve(__dirname, "../src");
const files = srcFiles(src, /\.tsx$/).filter((f) => !f.startsWith(path.join(src, "components/shadcn") + path.sep));

/** Files allowed to spell the card surface out, each for a reason `<Card>` cannot express. Keep this list short. */
const ALLOWED: Record<string, string> = {
  // A metric tile that is its own component: lifts on hover, staggers in, lays out a stat in a 20px pad. It draws the
  // same surface as Card; wrapping it would only add a layer around a component that is already the abstraction.
  "components/ui/KpiTile.tsx": "KpiTile is the tile component itself (lift/animate-rise, 20px padding, own layout)",
  // CARD_SHAPE: board cards are drag handles. The shadow changes while dragging (`shadow-raised`) and on hover, and
  // dnd-kit needs the class string it builds; Card's fixed resting shadow would fight those states.
  "components/BoardCard.tsx": "BoardCard owns the drag and hover shadow of a board card",
  // A radio drawn as a card: the border and tint follow the checked state of the input inside it.
  "components/ui/RadioCards.tsx": "RadioCards is a radio group drawn as cards; the surface follows the checked state",
  // Overlays are not page cards: they float (`shadow-raised`) and are replaced by shadcn Dialog in a later task of this
  // migration. The chat dock is the same: a fixed launcher button and panel.
  "components/DoneDialog.tsx": "modal surface (shadow-raised); becomes shadcn Dialog",
  "components/chat/ChatDockView.tsx": "floating chat launcher button (shadow-raised, fixed position)",
};

/** Every class token in every string literal under `node`. */
function tokensIn(node: ts.Node): Set<string> {
  const out = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      for (const t of n.text.split(/\s+/)) if (t) out.add(t);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

const isCardSurface = (t: Set<string>) => t.has("rounded-xl") && t.has("border") && t.has("bg-card");

/** Repo-relative (to src/) path and line of every card surface spelled out in `file`: in one string, or in one className. */
function spelledOut(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const at = (n: ts.Node) => `${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n: ts.Node) => {
    const literal = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n);
    if (literal && isCardSurface(tokensIn(n))) hits.push(at(n));
    else if (ts.isJsxAttribute(n) && n.name.getText(sf) === "className" && n.initializer && isCardSurface(tokensIn(n.initializer))) hits.push(at(n));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...new Set(hits)].map((line) => `${path.relative(src, file)}:${line}`);
}

describe("Card usage", () => {
  it("no card is rebuilt from raw classes", () => {
    const offenders = files
      .filter((f) => !(path.relative(src, f) in ALLOWED))
      .flatMap(spelledOut);
    expect(offenders).toEqual([]);
  });

  it("every allowlisted file still spells the surface out (drop it from the list when it stops)", () => {
    const stale = Object.keys(ALLOWED).filter((rel) => spelledOut(path.join(src, rel)).length === 0);
    expect(stale).toEqual([]);
  });
});
