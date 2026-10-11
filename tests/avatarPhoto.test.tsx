// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Avatar } from "@/components/ui/Avatar";

afterEach(cleanup);

describe("Avatar with a profile photo", () => {
  it("shows the photo when there is one", () => {
    render(<Avatar name="Wira Budi" src="/api/avatar/u1?v=1" />);
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/api/avatar/u1?v=1");
    expect(screen.getByRole("img", { name: "Wira Budi" })).toBeTruthy();
  });
  it("falls back to initials when there is no photo", () => {
    render(<Avatar name="Wira Budi" src={null} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Wira Budi" }).textContent).toBe("WB");
  });
});
