import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ user: { id: "u", appRole: "LEAD" as string }, itemOptions: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: async () => h.user, dbFor: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/kpi/projectQueries", () => ({ itemOptions: (...a: unknown[]) => h.itemOptions(...a) }));

import { loadItemOptions } from "@/app/(app)/dashboard/projects/actions";

describe("loadItemOptions", () => {
  beforeEach(() => { h.itemOptions.mockReset(); h.user = { id: "u", appRole: "LEAD" }; });
  it("is forbidden without dashboard.team and does not query", async () => {
    for (const role of ["REQUESTER", "CREATIVE"]) {
      h.user = { id: "u", appRole: role };
      expect(await loadItemOptions("p1", 2026)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    }
    expect(h.itemOptions).not.toHaveBeenCalled();
  });
  it("returns the options for a lead", async () => {
    h.itemOptions.mockResolvedValue([{ itemTitle: "Logo", assignedTo: [] }]);
    expect(await loadItemOptions("p1", 2026)).toEqual({ ok: true, options: [{ itemTitle: "Logo", assignedTo: [] }] });
    expect(h.itemOptions).toHaveBeenCalledWith({}, "p1", 2026);
  });
  it("rejects a bad project id or year", async () => {
    expect(await loadItemOptions("", 2026)).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await loadItemOptions("p1", 1.5)).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(h.itemOptions).not.toHaveBeenCalled();
  });
});
