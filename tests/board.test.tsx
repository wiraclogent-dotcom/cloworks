// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

const move = vi.fn();
vi.mock("@/app/(app)/requests/actions", () => ({ moveRequest: (...a: unknown[]) => move(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { renderToString } from "react-dom/server";
import { Board } from "@/components/Board";
import type { RequestRow } from "@/lib/requests";

const row = (id: string, title: string, status: RequestRow["status"], extra: Partial<RequestRow> = {}): RequestRow => ({
  id, title, status, brandName: "BrandA", divisionName: "DivX", requesterName: "Rina", assigneeName: "Cami",
  requestedAt: new Date("2026-10-01T00:00:00Z"), deadline: null, outputCount: 1, daysLeft: null, ...extra,
});
const rows = [row("1", "Banner", "FIRST_LOOK"), row("2", "Poster", "REQUESTED", { assigneeName: null })];

beforeEach(() => { move.mockReset(); refresh.mockReset(); });
afterEach(cleanup);

const column = (name: string) => screen.getByRole("region", { name: new RegExp(`^${name}`) });

describe("Board", () => {
  it("renders a column per status in workflow order with cards in the right column", () => {
    render(<Board requests={rows} canMove={false} />);
    const heads = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(heads.map((h) => h!.replace(/\d+$/, "").trim())).toEqual(["Requested", "On progress", "First look", "Done"]);
    expect(within(column("First look")).getByText("Banner")).toBeTruthy();
    expect(within(column("Requested")).getByText("Poster")).toBeTruthy();
  });

  it("shows plain-language empty states", () => {
    render(<Board requests={[]} canMove={true} />);
    expect(screen.getAllByText(/nothing here yet/i).length).toBe(4);
  });

  it("is read-only for a requester: no move menu, no drag handle", () => {
    render(<Board requests={rows} canMove={false} />);
    expect(screen.queryByLabelText(/^Move/)).toBeNull();
    expect(screen.queryByRole("button", { name: /drag/i })).toBeNull();
  });

  it("offers only legal next statuses in the Move to… menu", () => {
    render(<Board requests={rows} canMove={true} />);
    const sel = screen.getByLabelText(/Move “Banner”/) as HTMLSelectElement;
    const opts = Array.from(sel.options).filter((o) => o.value).map((o) => o.value);
    expect(opts).toEqual(["ON_PROGRESS", "DONE", "CANCELLED"]);
    expect(screen.getByRole("button", { name: /drag “Banner”/i })).toBeTruthy();
  });

  it("moves a card optimistically and refreshes on success", async () => {
    move.mockResolvedValue({ ok: true });
    render(<Board requests={rows} canMove={true} />);
    fireEvent.change(screen.getByLabelText(/Move “Poster”/), { target: { value: "ON_PROGRESS" } });
    expect(move).toHaveBeenCalledWith("2", "ON_PROGRESS", undefined);
    await waitFor(() => expect(within(column("On progress")).getByText("Poster")).toBeTruthy());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("choosing Done opens a dialog and submits outputCount and designFolderUrl", async () => {
    move.mockResolvedValue({ ok: true });
    render(<Board requests={rows} canMove={true} />);
    fireEvent.change(screen.getByLabelText(/Move “Banner”/), { target: { value: "DONE" } });
    const dialog = screen.getByRole("dialog");
    expect(move).not.toHaveBeenCalled();
    const count = within(dialog).getByLabelText(/Number of outputs/) as HTMLInputElement;
    expect(count.value).toBe("1");
    fireEvent.change(count, { target: { value: "4" } });
    fireEvent.change(within(dialog).getByLabelText(/Design folder link/), { target: { value: "https://drive.example.com/f" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /mark as done/i }));
    await waitFor(() => expect(move).toHaveBeenCalledWith("1", "DONE", { outputCount: 4, designFolderUrl: "https://drive.example.com/f" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("validates the dialog and closes on Escape", () => {
    render(<Board requests={rows} canMove={true} />);
    fireEvent.change(screen.getByLabelText(/Move “Banner”/), { target: { value: "DONE" } });
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Number of outputs/), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /mark as done/i }));
    expect(move).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/whole number of 1 or more/i)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Number of outputs/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Design folder link/), { target: { value: "ftp://x" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /mark as done/i }));
    expect(within(dialog).getByText(/http\(s\) link/i)).toBeTruthy();
    expect(move).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the server message and keeps the card in its column when the move fails", async () => {
    move.mockResolvedValue({ ok: false, code: "INVALID", message: "Request needs an assignee before it can be marked Done" });
    render(<Board requests={rows} canMove={true} />);
    fireEvent.change(screen.getByLabelText(/Move “Banner”/), { target: { value: "DONE" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /mark as done/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/needs an assignee/));
    expect(within(column("First look")).getByText("Banner")).toBeTruthy();
    expect(within(column("Done")).queryByText("Banner")).toBeNull();
  });

  it("reverts an optimistic move when the server rejects it", async () => {
    move.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Request status changed concurrently; reload and retry" });
    render(<Board requests={rows} canMove={true} />);
    fireEvent.change(screen.getByLabelText(/Move “Poster”/), { target: { value: "ON_PROGRESS" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/concurrently/));
    expect(within(column("Requested")).getByText("Poster")).toBeTruthy();
  });

  it("renders a deterministic dnd aria-describedby id (no hydration mismatch)", () => {
    const ids = (html: string) => [...html.matchAll(/aria-describedby="([^"]*)"/g)].map((m) => m[1]);
    const first = ids(renderToString(<Board requests={rows} canMove={true} />));
    const second = ids(renderToString(<Board requests={rows} canMove={true} />));
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(new Set(first)).toEqual(new Set(["request-board"]));
    render(<Board requests={rows} canMove={true} />);
    expect(screen.getByRole("button", { name: /drag “Banner”/i }).getAttribute("aria-describedby")).toBe("request-board");
  });

  it("returns focus to the card after Escape closes the Done dialog", () => {
    render(<Board requests={rows} canMove={true} />);
    fireEvent.change(screen.getByLabelText(/Move “Banner”/), { target: { value: "DONE" } });
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement?.closest("[data-card]")?.getAttribute("data-card")).toBe("1");
  });

  it("returns focus to the moved card after a move completes", async () => {
    move.mockResolvedValue({ ok: true });
    render(<Board requests={rows} canMove={true} />);
    fireEvent.change(screen.getByLabelText(/Move “Poster”/), { target: { value: "ON_PROGRESS" } });
    await waitFor(() => expect(within(column("On progress")).getByText("Poster")).toBeTruthy());
    await waitFor(() => expect(document.activeElement?.closest("[data-card]")?.getAttribute("data-card")).toBe("2"));
  });

  it("does not open the dialog for an unassigned card: shows an inline message", () => {
    move.mockResolvedValue({ ok: true });
    const r = [row("3", "Flyer", "FIRST_LOOK", { assigneeName: null })];
    render(<Board requests={r} canMove={true} />);
    fireEvent.change(screen.getByLabelText(/Move “Flyer”/), { target: { value: "DONE" } });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Assign someone before marking this request Done.");
    expect(move).not.toHaveBeenCalled();
  });
});
