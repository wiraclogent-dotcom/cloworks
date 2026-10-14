// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup } from "@testing-library/react";
import { compile } from "@tailwindcss/node";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), refresh: vi.fn() }) }));

import { Modal } from "@/components/ui/Modal";

afterEach(cleanup);

const src = path.resolve(__dirname, "../src");
const ASIDE = "app/(app)/requests/[id]/RequestDetailView.tsx";
const SUMMARY = "app/(app)/requests/new/NewRequestForm.tsx";
// The sticky aside / summary card sit under the panel's own sticky header bar (about 53px), so inside the right
// Sheet they stick at top-16 instead of top-6. The route panel is a Radix Sheet: `div[data-slot=sheet-content]`.
const SHEET_OFFSET = "in-data-[slot=sheet-content]:@3xl:top-16";

describe("sticky offset inside the side panel", () => {
  for (const file of [ASIDE, SUMMARY]) {
    it(`${file} offsets its sticky box for the Sheet, not the old native <dialog>`, () => {
      const text = readFileSync(path.join(src, file), "utf8");
      expect(text).toContain(SHEET_OFFSET);
      expect(text).not.toContain("in-[dialog]");
    });
  }

  it("Tailwind turns the class into a selector that matches inside the route panel's Sheet, and only there", async () => {
    const compiler = await compile('@import "tailwindcss";', { base: process.cwd(), onDependency() {} });
    const css = compiler.build([SHEET_OFFSET]);
    const selector = /^\s*(:where\(\[data-slot="sheet-content"\]\) \.[^{]+)\{/m.exec(css)?.[1]?.trim();
    expect(selector, css).toBeTruthy();

    const { baseElement } = render(
      <>
        <Modal title="Request" side="right"><div data-testid="in-panel" className={SHEET_OFFSET} /></Modal>
        <div data-testid="outside" className={SHEET_OFFSET} />
      </>,
    );
    const inPanel = baseElement.querySelector('[data-testid="in-panel"]')!;
    const outside = baseElement.querySelector('[data-testid="outside"]')!;
    expect(inPanel.closest("[data-slot=sheet-content]")).not.toBeNull();
    expect(inPanel.matches(selector!)).toBe(true);
    expect(outside.matches(selector!)).toBe(false);
  });
});
