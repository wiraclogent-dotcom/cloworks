// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { MarketingMonthData } from "@/lib/marketing/types";

const refresh = vi.fn();
const act = { saveProductFocus: vi.fn(), saveAnnouncement: vi.fn(), deleteAnnouncement: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/app/(app)/marketing/actions", () => ({
  saveProductFocus: (...a: unknown[]) => act.saveProductFocus(...a),
  saveAnnouncement: (...a: unknown[]) => act.saveAnnouncement(...a),
  deleteAnnouncement: (...a: unknown[]) => act.deleteAnnouncement(...a),
}));

import { MonthBand } from "@/components/marketing/MonthBand";

const base: MarketingMonthData = { month: "2026-10", today: "2026-10-19", divisions: [], activities: [], announcements: [], productFocus: null, editableDivisionIds: [], canManageMonth: false };
const notices = [
  { id: "n1", body: "Inbound China (Pitbond)", startDay: "2026-10-22", endDay: "2026-10-24" },
  { id: "n2", body: "Budget Q4 approved", startDay: null, endDay: null },
];

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("MonthBand for members", () => {
  it("renders nothing when the month has no focus and no announcements", () => {
    const { container } = render(<MonthBand data={base} />);
    expect(container.innerHTML).toBe("");
  });
  it("shows only the focus card when there are no announcements", () => {
    render(<MonthBand data={{ ...base, productFocus: "Lavender 1L + refill" }} />);
    expect(screen.getByText("Lavender 1L + refill")).toBeTruthy();
    expect(screen.queryByText("Announcements")).toBeNull();
  });
  it("shows date pills and no editing controls", () => {
    render(<MonthBand data={{ ...base, announcements: notices }} />);
    const items = within(screen.getByRole("list", { name: "Announcements" })).getAllByRole("listitem");
    expect(items[0].textContent).toContain("22–24 Oct");
    expect(items[1].textContent).toContain("No date");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("MonthBand for admins", () => {
  const admin = { ...base, canManageMonth: true };

  it("invites them to fill an empty month", () => {
    render(<MonthBand data={admin} />);
    expect(screen.getByRole("button", { name: "Set this month's product focus" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add an announcement" })).toBeTruthy();
  });

  it("edits the product focus and refreshes on success", async () => {
    act.saveProductFocus.mockResolvedValue({ ok: true });
    render(<MonthBand data={{ ...admin, productFocus: "Lavender" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit product focus" }));
    fireEvent.change(screen.getByLabelText("Product focus"), { target: { value: "Lavender 1L + refill" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(act.saveProductFocus).toHaveBeenCalledWith("2026-10", "Lavender 1L + refill");
  });

  it("shows a field error from the server", async () => {
    act.saveProductFocus.mockResolvedValue({ ok: false, code: "INVALID", message: "Check the highlighted fields.", fieldErrors: { productFocus: "Product focus must be 500 characters or fewer." } });
    render(<MonthBand data={admin} />);
    fireEvent.click(screen.getByRole("button", { name: "Set this month's product focus" }));
    fireEvent.change(screen.getByLabelText("Product focus"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Product focus must be 500 characters or fewer.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("adds an undated announcement", async () => {
    act.saveAnnouncement.mockResolvedValue({ ok: true, id: "n9" });
    render(<MonthBand data={admin} />);
    fireEvent.click(screen.getByRole("button", { name: "Add an announcement" }));
    const dialog = await screen.findByRole("dialog", { name: "Add announcement" });
    fireEvent.change(within(dialog).getByLabelText("Announcement"), { target: { value: "Budget Q4 approved" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(act.saveAnnouncement).toHaveBeenCalledWith(null, { month: "2026-10", body: "Budget Q4 approved", startDay: null, endDay: null });
  });

  it("edits an announcement with its dates", async () => {
    act.saveAnnouncement.mockResolvedValue({ ok: true, id: "n1" });
    render(<MonthBand data={{ ...admin, announcements: notices }} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit announcement: Inbound China (Pitbond)" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit announcement" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(act.saveAnnouncement).toHaveBeenCalledWith("n1", { month: "2026-10", body: "Inbound China (Pitbond)", startDay: "2026-10-22", endDay: "2026-10-24" }));
  });

  it("deletes an announcement after confirmation", async () => {
    act.deleteAnnouncement.mockResolvedValue({ ok: true });
    render(<MonthBand data={{ ...admin, announcements: notices }} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete announcement: Budget Q4 approved" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete this announcement?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(act.deleteAnnouncement).toHaveBeenCalledWith("n2"));
  });
});
