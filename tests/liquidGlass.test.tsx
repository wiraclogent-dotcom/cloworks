// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { LiquidGlassFilter } from "@/components/ui/LiquidGlassFilter";
import { DndContext } from "@dnd-kit/core";
import { BoardCard, CARD_OVERLAY } from "@/components/BoardCard";
import type { RequestRow } from "@/lib/requests";

const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
const layout = readFileSync(path.resolve(__dirname, "../src/app/layout.tsx"), "utf8");

describe("Liquid glass", () => {
  it("the lens is an SVG filter the utility can point at, hidden from assistive tech", () => {
    const { container } = render(<LiquidGlassFilter />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("filter#liquid-glass feDisplacementMap, filter#liquid-glass fedisplacementmap")).not.toBeNull();
    expect(svg.querySelector("filter#glass-blur")).not.toBeNull();
    expect(css).toMatch(/@utility liquid-glass\s*{[^}]*url\(#liquid-glass\)/);
  });

  it("the root layout renders the lens once", () => {
    expect(layout.match(/<LiquidGlassFilter \/>/g)).toHaveLength(1);
  });

  it("both themes draw the glass lip", () => {
    expect(css.match(/--glass-edge:/g)).toHaveLength(2);
    expect(css).toMatch(/--glass-tint:/);
  });

  it("the dragged board card is glass, not the solid card", () => {
    const tokens = CARD_OVERLAY.split(/\s+/);
    expect(tokens).toContain("liquid-glass");
    expect(tokens).not.toContain("bg-card");
  });

  it("resting cards turn to glass only on a picture background", () => {
    const row: RequestRow = {
      id: "c1", title: "Banner", status: "REQUESTED", brandName: "BrandA", divisionName: "DivX", requesterName: "Rina", assignees: [],
      requestedAt: new Date("2026-10-01T00:00:00Z"), deadline: null, outputCount: 1, daysLeft: null, needsMotion: false,
    };
    const card = (glass: boolean) => {
      const { container, unmount } = render(<DndContext><ul><BoardCard card={row} canMove={false} busy={false} dragging={false} glass={glass} /></ul></DndContext>);
      const li = container.querySelector("li")!;
      if (glass) expect([...li.querySelectorAll("[data-glass-layer]")].map((l) => l.getAttribute("data-glass-layer"))).toEqual(["bend", "face", "edge"]);
      const cls = li.className.split(/\s+/);
      unmount();
      return cls;
    };
    expect(card(true)).toContain("bg-white/8");
    expect(card(true)).not.toContain("bg-card");
    expect(card(false)).toContain("bg-card");
    expect(css).toMatch(/@utility board-gradient {[^}]*\/board\/gradient\.jpg/);
    expect(existsSync(path.resolve(__dirname, "../public/board/gradient.jpg"))).toBe(true);
  });
});
