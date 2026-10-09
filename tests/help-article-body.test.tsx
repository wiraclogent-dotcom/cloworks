// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ArticleBody } from "@/components/help/ArticleBody";

afterEach(cleanup);

describe("ArticleBody", () => {
  it("renders ## as an h2 with an id from the heading text", () => {
    const { container } = render(<ArticleBody body={"## Steps"} />);
    const h2 = container.querySelector("h2");
    expect(h2?.textContent).toBe("Steps");
    expect(h2?.id).toBe("steps");
  });

  it("renders raw HTML as escaped text, never as markup", () => {
    const { container } = render(<ArticleBody body={"Hello <script>alert(1)</script> <img src=x onerror=alert(1)>"} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("renders **bold** as strong", () => {
    const { container } = render(<ArticleBody body={"Open **New request**."} />);
    expect(container.querySelector("strong")?.textContent).toBe("New request");
  });
});
