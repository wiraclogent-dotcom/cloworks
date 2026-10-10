import { describe, it, expect, vi } from "vitest";
import { isValidElement } from "react";

// The panel bodies hit the database; only which panel is chosen matters here.
vi.mock("@/app/(app)/requests/[id]/RequestDetailContent", () => ({ DetailContent: () => null }));
vi.mock("@/app/(app)/requests/new/NewRequestContent", () => ({ NewRequestContent: () => null, FormSkeleton: () => null }));

import { PanelForId } from "@/app/(app)/requests/@modal/(.)[id]/PanelForId";
import NewRequestPanel from "@/app/(app)/requests/@modal/(.)new/page";

describe("request side panel routing", () => {
  // Both (.)new and (.)[id] intercept /requests/new; Next 16.4 can hand it to (.)[id] with id "new".
  it('shows the New request panel when (.)[id] receives "new"', async () => {
    const el = await PanelForId({ params: Promise.resolve({ id: "new" }) });
    expect(isValidElement(el) && el.type).toBe(NewRequestPanel);
  });

  it("shows the request detail panel for a real id", async () => {
    const el = await PanelForId({ params: Promise.resolve({ id: "ckabc123" }) });
    expect(isValidElement(el) && el.type).not.toBe(NewRequestPanel);
    expect(isValidElement(el) && (el.props as { title?: string }).title).toBe("Request");
  });
});
