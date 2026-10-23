import { describe, it, expect, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: "u1", name: "U", appRole: "REQUESTER", jobRole: "OTHER", workspaceId: "w", mustChangePassword: false }),
  dbFor: () => ({ note: { create: async () => ({ id: "n1" }) } }),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { createNote } from "@/app/(app)/notes/actions";

describe("createNote", () => {
  // Revalidating would re-render the URL the person is leaving (no ?note=), whose load cleans up empty notes: the new,
  // still empty note would be gone before the page that opens it loads.
  it("does not revalidate: the page that opens the new note renders it fresh", async () => {
    expect(await createNote(null)).toEqual({ ok: true, id: "n1" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
