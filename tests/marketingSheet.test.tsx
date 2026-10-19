// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { MarketingMonthData } from "@/lib/marketing/types";

const refresh = vi.fn();
const act = { saveActivity: vi.fn(), deleteActivity: vi.fn() };
vi.mock("@/components/useNarrow", () => ({ useNarrow: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/app/(app)/marketing/actions", () => ({
  saveActivity: (...a: unknown[]) => act.saveActivity(...a), deleteActivity: (...a: unknown[]) => act.deleteActivity(...a),
  saveProductFocus: vi.fn(), saveAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(),
}));

import { MarketingCalendar } from "@/components/marketing/MarketingCalendar";
import { MarketingSheetProvider } from "@/components/marketing/sheetState";
import { AddActivityButton } from "@/components/marketing/AddActivityButton";
import { OCTOBER } from "./helpers/marketingFixture";

function page(data: MarketingMonthData) {
  return render(
    <MarketingSheetProvider data={data}>
      {data.editableDivisionIds.length ? <AddActivityButton /> : null}
      <MarketingCalendar data={data} />
    </MarketingSheetProvider>,
  );
}
const kolLead = { ...OCTOBER, editableDivisionIds: ["kol"] };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ActivitySheet", () => {
  it("is read-only for someone who does not lead the division", async () => {
    page(OCTOBER);
    fireEvent.click(screen.getByRole("button", { name: "Brand: Brand photoshoot, 21 Oct, planned" }));
    const sheet = await screen.findByRole("dialog", { name: "Brand photoshoot" });
    expect(sheet.textContent).toContain("21 Oct");
    expect(sheet.textContent).toContain("Planned");
    expect(sheet.textContent).toContain("Last edited by Wira");
    expect(within(sheet).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(sheet).queryByRole("textbox")).toBeNull();
  });

  it("pre-fills a new activity from an empty lane day and saves it", async () => {
    act.saveActivity.mockResolvedValue({ ok: true, id: "new1" });
    page(kolLead);
    fireEvent.click(screen.getByRole("button", { name: "Add activity to KOL on 22 Oct" }));
    const sheet = await screen.findByRole("dialog", { name: "New activity" });
    const division = within(sheet).getByLabelText("Division") as HTMLSelectElement;
    expect([...division.options].map((o) => o.textContent)).toEqual(["KOL"]);
    expect(within(sheet).getByRole("button", { name: /^Start date/ }).textContent).toContain("22 Oct");
    expect(within(sheet).getByRole("button", { name: /^End date/ }).textContent).toContain("22 Oct");
    expect(sheet.textContent).toContain("One day");
    fireEvent.change(within(sheet).getByLabelText("Title"), { target: { value: "IG Live" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(act.saveActivity).toHaveBeenCalledWith(null, { title: "IG Live", divisionId: "kol", startDay: "2026-10-22", endDay: "2026-10-22", status: "PLANNED" });
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "New activity" })).toBeNull());
  });

  it("sends the chosen status", async () => {
    act.saveActivity.mockResolvedValue({ ok: true, id: "new1" });
    page(kolLead);
    fireEvent.click(screen.getByRole("button", { name: "Add activity to KOL on 22 Oct" }));
    const sheet = await screen.findByRole("dialog", { name: "New activity" });
    fireEvent.change(within(sheet).getByLabelText("Title"), { target: { value: "IG Live" } });
    fireEvent.click(within(sheet).getByRole("radio", { name: "Confirmed" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(act.saveActivity).toHaveBeenCalled());
    expect(act.saveActivity.mock.calls[0][1].status).toBe("CONFIRMED");
  });

  it("keeps the sheet open with the server's message when the lead lost access", async () => {
    act.saveActivity.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "You can only edit activities of divisions you lead." });
    page(kolLead);
    fireEvent.click(screen.getByRole("button", { name: "Add activity to KOL on 22 Oct" }));
    const sheet = await screen.findByRole("dialog", { name: "New activity" });
    fireEvent.change(within(sheet).getByLabelText("Title"), { target: { value: "IG Live" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await within(sheet).findByText("You can only edit activities of divisions you lead.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a field error under its field", async () => {
    act.saveActivity.mockResolvedValue({ ok: false, code: "INVALID", message: "Check the highlighted fields.", fieldErrors: { endDay: "End date can't be before the start date." } });
    page(kolLead);
    fireEvent.click(screen.getByRole("button", { name: "Add activity to KOL on 22 Oct" }));
    const sheet = await screen.findByRole("dialog", { name: "New activity" });
    fireEvent.change(within(sheet).getByLabelText("Title"), { target: { value: "IG Live" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await within(sheet).findByText("End date can't be before the start date.")).toBeTruthy();
  });

  it("lets the lead edit and delete their division's activity", async () => {
    act.deleteActivity.mockResolvedValue({ ok: true });
    page(kolLead);
    fireEvent.click(screen.getAllByRole("button", { name: /^KOL: KOL batch 3 posting/ })[0]);
    const sheet = await screen.findByRole("dialog", { name: "Edit activity" });
    expect((within(sheet).getByLabelText("Title") as HTMLInputElement).value).toBe("KOL batch 3 posting");
    expect(within(sheet).getByRole("radio", { name: "Done" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete this activity?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(act.deleteActivity).toHaveBeenCalledWith("a4"));
  });

  it("opens a blank new activity from the header button", async () => {
    page(kolLead);
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    const sheet = await screen.findByRole("dialog", { name: "New activity" });
    expect((within(sheet).getByLabelText("Division") as HTMLSelectElement).value).toBe("kol");
    expect((within(sheet).getByLabelText("Title") as HTMLInputElement).value).toBe("");
  });
});
