// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { setPhotoDirectory } from "@/components/ui/photoDirectory";

afterEach(() => { cleanup(); setPhotoDirectory([]); });

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

describe("Avatar reads the workspace photo directory", () => {
  it("shows a person's photo by short or full name, case- and space-insensitive", () => {
    act(() => setPhotoDirectory([{ names: ["Wira", "Wira Budi Prasetyo"], src: "/api/avatar/u1?v=2" }]));
    render(<><Avatar name=" wira " /><Avatar name="Wira  Budi Prasetyo" /><Avatar name="Dimas" /></>);
    const srcs = [...document.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toEqual(["/api/avatar/u1?v=2", "/api/avatar/u1?v=2"]);
  });
  it("updates avatars already on screen when the photo changes", () => {
    act(() => setPhotoDirectory([{ names: ["Wira"], src: "/api/avatar/u1?v=1" }]));
    render(<AvatarStack names={["Wira", "Dimas"]} />);
    act(() => setPhotoDirectory([{ names: ["Wira"], src: "/api/avatar/u1?v=9" }]));
    expect(document.querySelector("img")?.getAttribute("src")).toBe("/api/avatar/u1?v=9");
  });
  it("an explicit src (or null) wins over the directory", () => {
    act(() => setPhotoDirectory([{ names: ["Wira"], src: "/api/avatar/u1?v=1" }]));
    render(<><Avatar name="Wira" src={null} /><Avatar name="Wira" src="/channel.jpg" /></>);
    expect([...document.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual(["/channel.jpg"]);
  });
});
