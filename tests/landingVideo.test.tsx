// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HOW_IT_WORKS_VIDEO, HowItWorksVideo } from "@/components/landing/HowItWorksVideo";

afterEach(cleanup);

describe("landing: See how it works", () => {
  it("is a link to the How it works section that opens the intro video in a dialog instead", () => {
    render(<HowItWorksVideo />);
    const link = screen.getByRole("link", { name: "See how it works" });
    expect(link.getAttribute("href")).toBe("#how");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(link);
    const dialog = screen.getByRole("dialog", { name: "See how Clowork works" });
    const video = dialog.querySelector("video");
    expect(video?.getAttribute("src")).toBe(HOW_IT_WORKS_VIDEO);
    expect(video?.hasAttribute("controls")).toBe(true);
  });

  it("ships the video file it points at", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../public", HOW_IT_WORKS_VIDEO.slice(1)))).toBe(true);
  });
});
