import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { srcFiles } from "./helpers/srcFiles";

const src = path.resolve(__dirname, "../src");
const shadcn = path.join(src, "components/shadcn") + path.sep;
const files = srcFiles(src).filter((f) => !f.startsWith(shadcn));

/**
 * The chat dock is a non-modal floating panel (no backdrop, no focus trap, the page stays usable while it is open),
 * so a labelled role="dialog" region is right for it; a Radix Dialog with modal={false} would add nothing but weight.
 */
const ALLOWED_ROLE_DIALOG = new Set(["components/chat/ChatDockView.tsx"]);

describe("Overlay usage", () => {
  it("no hand-rolled dialogs", () => {
    // Dialogs, confirms and side panels are shadcn Dialog / AlertDialog / Sheet (focus trap, Esc, scroll lock,
    // nested-dialog Esc and focus return come from Radix).
    const found = files.flatMap((f) => {
      const rel = path.relative(src, f).split(path.sep).join("/");
      const text = readFileSync(f, "utf8");
      const hits: string[] = [];
      if (/<dialog[\s>/]/.test(text)) hits.push(`${rel}: <dialog>`);
      if (/role=\{?\s*["'`]dialog["'`]/.test(text) && !ALLOWED_ROLE_DIALOG.has(rel)) hits.push(`${rel}: role="dialog"`);
      if (/role=\{?\s*["'`]alertdialog["'`]/.test(text)) hits.push(`${rel}: role="alertdialog"`);
      if (/aria-modal\b/.test(text)) hits.push(`${rel}: aria-modal`);
      if (/\.showModal\(/.test(text)) hits.push(`${rel}: .showModal()`);
      // Matched the old native <dialog> panel; the route panel is a Radix Sheet now (in-data-[slot=sheet-content]).
      if (/\bin-\[dialog\]/.test(text)) hits.push(`${rel}: in-[dialog] variant`);
      return hits;
    });
    expect(found).toEqual([]);
  });

  it("no hand-rolled menus or details popovers", () => {
    // Menus are shadcn DropdownMenu (arrow keys, typeahead, Esc and focus return); floating panels are Popover;
    // disclosures are Collapsible.
    const found = files.flatMap((f) => {
      const rel = path.relative(src, f).split(path.sep).join("/");
      const text = readFileSync(f, "utf8");
      const hits: string[] = [];
      if (/role=\{?\s*["'`]menu(item)?["'`]/.test(text)) hits.push(`${rel}: role="menu"/"menuitem"`);
      if (/<details[\s>/]/.test(text)) hits.push(`${rel}: <details>`);
      return hits;
    });
    expect(found).toEqual([]);
  });
});
