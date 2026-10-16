// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/library/actions", () => ({ moveItem: vi.fn(), setPinned: vi.fn() }));

import { createTestDb, type TestDb } from "./helpers/testDb";
import { createItemWith, loadLibrary } from "@/lib/library";
import { LibraryView } from "@/components/library/LibraryView";

afterEach(cleanup);

describe("library end-to-end: lead adds, requester sees", () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db?.stop(); });

  it("shows a lead-created pinned item to a requester without manage controls", async () => {
    const lead = await db.prisma.user.create({ data: { email: "lead-e2e@clogent.co.id", name: "L", fullName: "L", appRole: "LEAD" } });
    const cat = await db.prisma.libraryCategory.findFirstOrThrow({ where: { name: "Latest Updates" } });
    await createItemWith(db.prisma, { id: lead.id, appRole: "LEAD" }, {
      title: "Q4 launch deck", url: "https://docs.google.com/presentation/d/e2e", categoryId: cat.id, pinned: true,
    });

    const data = await loadLibrary(db.prisma);
    render(<LibraryView {...data} canManage={false} now={new Date()} />);

    // The Pinned card: nearest ancestor of the heading that also holds the row.
    let pinned = screen.getByRole("heading", { name: "Pinned" }).parentElement as HTMLElement;
    while (!pinned.querySelector("a")) pinned = pinned.parentElement as HTMLElement;
    const link = within(pinned).getByRole("link", { name: /Q4 launch deck/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(within(pinned).getByText(/New ·/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add link" })).toBeNull();
  });
});
