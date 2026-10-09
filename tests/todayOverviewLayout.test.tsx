// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TodayOverview } from "@/components/TodayOverview";

afterEach(cleanup);

describe("TodayOverview layout", () => {
  it("stacks the welcome card full width above the tiles at every width, never one row", () => {
    render(<TodayOverview name="Wira Budi" now={new Date("2026-10-10T01:00:00Z")} overview={{ open: 29, dueToday: 10, overdue: 8, doneToday: 0 }} />);
    const section = screen.getByRole("region", { name: "Today" });
    // No column split on the section itself: the card and the tile row each take a full row.
    expect(section.className).not.toMatch(/grid-cols/);
    const [card, tiles] = Array.from(section.children);
    expect(card.textContent).toContain("Good morning, Wira");
    expect(tiles.tagName).toBe("UL");
    expect(tiles.className).toContain("sm:grid-cols-4");
  });
});
