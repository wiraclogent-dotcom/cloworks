// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/app/waitlistActions", () => ({ joinWaitlist: vi.fn() }));
import { Landing } from "@/components/landing/Landing";

afterEach(cleanup);

const H2 = [
  "From design brief to finished post",
  "How a design request moves, from brief to approval",
  "Built for requesters, designers and creative leads",
  "Track design requests on a board, table or calendar",
  "Questions",
  "Bring your team's design requests into one place.",
];
const FAQ = ["What is a design request tool?", "Who is Clowork for?", "Can it handle video requests?", "How do I get access?"];

describe("landing: SEO copy", () => {
  it("has one H1 and the spec's H2s", () => {
    const { container } = render(<Landing />);
    const h1 = container.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe("Manage every design request, from brief to done.");
    const h2 = Array.from(container.querySelectorAll("h2")).map((h) => h.textContent);
    for (const t of H2) expect(h2).toContain(t);
  });

  it("sends both primary buttons to the waitlist form in the closing band", () => {
    const { container } = render(<Landing />);
    const links = screen.getAllByRole("link", { name: "Join the waitlist" });
    expect(links).toHaveLength(2);
    for (const l of links) expect(l.getAttribute("href")).toBe("#waitlist");
    const section = container.querySelector("section#waitlist");
    expect(section).not.toBeNull();
    expect(section!.querySelector("form")).not.toBeNull();
    expect(container.querySelector('a[href="#faq"]')).not.toBeNull();
  });

  it("has the four FAQ questions", () => {
    const { container } = render(<Landing />);
    const faq = container.querySelector("section#faq");
    expect(faq).not.toBeNull();
    const summaries = Array.from(faq!.querySelectorAll("details > summary")).map((s) => s.textContent);
    expect(summaries).toEqual(FAQ);
  });

  it("never says Cloworks or free", () => {
    render(<Landing />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Cloworks/);
    expect(text).not.toMatch(/\bfree\b/i);
  });

  it("keeps Sign in reachable at every width: a visible header link and a link in the last FAQ answer", () => {
    const { container } = render(<Landing />);
    const header = container.querySelector("header")!;
    const link = Array.from(header.querySelectorAll("a")).find((a) => a.textContent === "Sign in");
    expect(link?.getAttribute("href")).toBe("/signin");
    expect(link!.classList.contains("hidden")).toBe(false);
    const answer = container.querySelectorAll("section#faq details")[3];
    expect(answer.querySelector('a[href="/signin"]')?.textContent).toBe("Sign in");
    expect(answer.textContent).toContain("Already on a team that uses Clowork? Sign in.");
  });
});
