// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AppError from "@/app/(app)/error";
import NotFound from "@/app/not-found";

afterEach(cleanup);

describe("error boundary", () => {
  it("shows a generic message (never the error text), a Try again button and a sign-in link", () => {
    const reset = vi.fn();
    render(<AppError error={new Error("secret db detail")} reset={reset} />);
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong. Try again, or sign in again.");
    expect(document.body.textContent).not.toContain("secret db detail");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /sign in again/i }).getAttribute("href")).toBe("/signin");
  });
});

describe("not-found page", () => {
  it("is branded and links back to the app", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to requests/i }).getAttribute("href")).toBe("/requests");
  });
});
