// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { BrandTag } from "@/components/ui/BrandTag";
import { setBrandDirectory } from "@/components/ui/brandDirectory";

afterEach(() => { cleanup(); act(() => setBrandDirectory([])); });
const toneOf = (name: string) => render(<BrandTag name={name} />).container.querySelector("[data-tone]")!.getAttribute("data-tone");

describe("BrandTag colours", () => {
  it("falls back to today's colours without a directory (landing, sign-in)", () => {
    expect(toneOf("Clogent")).toBe("tag-clogent");
    expect(toneOf("Clenvo")).toBe("tag-neutral");
  });

  it("uses the brand's chosen colour from the directory", () => {
    act(() => setBrandDirectory([{ name: "Clenvo", color: "div-5" }, { name: "Clogent", color: "div-1" }]));
    expect(toneOf("Clenvo")).toBe("div-5");
    expect(toneOf("Clogent")).toBe("div-1");
  });

  it("matches names ignoring case and spacing, and treats an unknown colour as grey", () => {
    act(() => setBrandDirectory([{ name: "Bubble Wash", color: "tag-bubble-wash" }, { name: "Nuvie", color: "nope" }]));
    expect(toneOf(" bubble  wash ")).toBe("tag-bubble-wash");
    expect(toneOf("Nuvie")).toBe("tag-neutral");
  });
});
