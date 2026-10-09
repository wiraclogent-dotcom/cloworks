import { describe, it, expect } from "vitest";
import { activeNavHref } from "@/lib/nav";

describe("activeNavHref", () => {
  it.each([
    ["/requests", "/requests"],
    ["/requests/", "/requests"],
    ["/requests/abc123", "/requests"],
    ["/requests/new", "/requests"],
    ["/projects", "/projects"],
    ["/projects/p1/edit", "/projects"],
    ["/dashboard", "/dashboard"],
    ["/dashboard/team", "/dashboard/team"],
    ["/dashboard/briefs", "/dashboard/briefs"],
  ])("%s → %s", (path, want) => {
    expect(activeNavHref(path)).toBe(want);
  });
  it("does not match on a shared prefix that is not a path segment", () => {
    expect(activeNavHref("/requestsX")).toBeNull();
    expect(activeNavHref("/signin")).toBeNull();
    expect(activeNavHref("/admin/users")).toBeNull(); // Admin lives in Settings, not the sidebar
    expect(activeNavHref(null)).toBeNull();
  });
});
