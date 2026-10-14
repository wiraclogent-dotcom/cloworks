// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Activity, useState, type ReactNode } from "react";
import { render, screen, fireEvent, cleanup, within, waitFor, act } from "@testing-library/react";

const back = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back, refresh }) }));
vi.mock("@/app/(app)/requests/actions", () => ({ rescheduleRequest: vi.fn() }));

import { Modal } from "@/components/ui/Modal";
import { DoneDialog } from "@/components/DoneDialog";
import { DayDialog } from "@/components/calendar/DayDialog";
import { BriefDayDialog } from "@/components/briefs/BriefDayDialog";
import { LibraryDialog } from "@/components/library/LibraryDialog";
import { RequestCalendar } from "@/components/RequestCalendar";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/shadcn/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogTitle, AlertDialogTrigger } from "@/components/shadcn/alert-dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/shadcn/sheet";
import { Button } from "@/components/shadcn/button";
import type { CalendarRow } from "@/lib/requests";

beforeEach(() => {
  back.mockReset();
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

/** Radix registers its outside-pointer listener on the next tick after opening. */
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const overlay = () => document.querySelector<HTMLElement>("[data-slot$='-overlay']");
const scrollLocked = () => document.body.hasAttribute("data-scroll-locked");
/** No overlay in the document, or only ones Next's Activity has hidden. */
const noVisibleOverlay = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-slot$='-overlay']")).every((el) => el.style.display === "none");

describe("route Modal", () => {
  const actions: [string, () => void | Promise<void>][] = [
    ["Close", () => { fireEvent.click(screen.getByRole("button", { name: "Close" })); }],
    ["Esc", () => { fireEvent.keyDown(screen.getByText("Body"), { key: "Escape" }); }],
    ["an overlay click", async () => { await tick(); fireEvent.pointerDown(overlay()!); fireEvent.click(overlay()!); }],
  ];

  it("route Modal goes back once on Close, Esc and an overlay click, not on a click inside", async () => {
    for (const side of ["center", "right"] as const) {
      for (const [name, act_] of actions) {
        back.mockReset();
        render(<Modal side={side} title="Request"><p>Body</p></Modal>);
        await screen.findByRole("dialog", { name: "Request" });
        await tick();
        fireEvent.pointerDown(screen.getByText("Body"));
        fireEvent.click(screen.getByText("Body"));
        expect(back, `${side}: click inside`).not.toHaveBeenCalled();
        await act_();
        // A second Esc while the navigation is in flight must not go back again.
        fireEvent.keyDown(document.body, { key: "Escape" });
        expect(back, `${side}: ${name}`).toHaveBeenCalledTimes(1);
        cleanup();
      }
    }
  });

  it("route Modal closes when unmounted and leaves no overlay or scroll lock", async () => {
    // Next keeps a route it navigated away from mounted inside a hidden <Activity>; browser Back shows it again.
    const Route = ({ hidden }: { hidden: boolean }) => (
      <>
        <button type="button">Sidebar link</button>
        <Activity mode={hidden ? "hidden" : "visible"}><Modal title="New project" description="Add a project."><p>Form</p></Modal></Activity>
      </>
    );
    const { rerender, unmount } = render(<Route hidden={false} />);
    const dialog = await screen.findByRole("dialog", { name: "New project" });
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toBe("Add a project.");
    expect(overlay()).toBeTruthy();
    expect(scrollLocked()).toBe(true);

    rerender(<Route hidden />);
    // React hides the portal at once (display:none) and the closing state update renders later at offscreen priority, which this test
    // does not wait for; either way nothing may stay on screen, and the effects (scroll lock, aria-hidden, focus trap) end.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(noVisibleOverlay()).toBe(true);
    expect(scrollLocked()).toBe(false);
    expect(screen.getByRole("button", { name: "Sidebar link" })).toBeTruthy(); // not aria-hidden any more
    expect(back).not.toHaveBeenCalled();

    rerender(<Route hidden={false} />);
    expect(await screen.findByRole("dialog", { name: "New project" })).toBeTruthy();
    expect(scrollLocked()).toBe(true);

    unmount();
    expect(overlay()).toBeNull();
    expect(scrollLocked()).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  it("side=right is a labelled sheet with actions next to Close", async () => {
    render(<Modal side="right" title="Request" actions={<button type="button">Open full page</button>}><h1>Banner</h1></Modal>);
    const dialog = await screen.findByRole("dialog", { name: "Request" });
    expect(dialog.getAttribute("data-slot")).toBe("sheet-content");
    expect(dialog.getAttribute("data-side")).toBe("right");
    // Full width on phones, the wide panel from sm up.
    expect(dialog.className).toMatch(/(^| )w-full( |$)/);
    expect(dialog.className).toContain("sm:w-[min(64rem,92vw)]");
    expect(dialog.className).toContain("lg:w-[62vw]");
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close.parentElement!.contains(within(dialog).getByRole("button", { name: "Open full page" }))).toBe(true);
    expect(within(dialog).getByRole("heading", { level: 1, name: "Banner" })).toBeTruthy();
  });
});

describe("nested dialogs", () => {
  it("Esc in DoneDialog over the request sheet closes only DoneDialog", async () => {
    const onCancel = vi.fn();
    function Panel() {
      const [done, setDone] = useState(false);
      return (
        <Modal side="right" title="Request">
          <button type="button" onClick={() => setDone(true)}>Done</button>
          {done && <DoneDialog title="Poster" onCancel={() => { onCancel(); setDone(false); }} onSubmit={() => {}} />}
        </Modal>
      );
    }
    render(<Panel />);
    await screen.findByRole("dialog", { name: "Request" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const count = within(screen.getByRole("dialog", { name: "Mark as done" })).getByLabelText(/Number of outputs/);
    await waitFor(() => expect(document.activeElement).toBe(count));

    fireEvent.keyDown(count, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Mark as done" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Request" })).toBeTruthy();
    expect(back).not.toHaveBeenCalled();

    // The next Esc closes the panel.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("local dialogs", () => {
  const row = (id: string, title: string): CalendarRow => ({
    id, title, status: "REQUESTED", brandName: "Clogent", divisionName: "DivX", requesterName: "Rina", assignees: [{ id: "cami", name: "Cami" }],
    requestedAt: new Date("2026-10-01T03:00:00Z"), deadline: new Date("2026-10-13T17:00:00Z"), outputCount: 1, daysLeft: 6,
    needsMotion: false, requestDay: "2026-10-01", deadlineDay: "2026-10-14",
  });

  it("a local dialog returns focus to the button that opened it", async () => {
    const rows = ["A", "B", "C", "D", "E"].map((t, i) => row(String(i + 1), `Poster ${t}`));
    render(<RequestCalendar rows={rows} month="2026-10" today="2026-10-08" canMove={false} prevHref="/p" nextHref="/n" todayHref="/t" />);
    const more = screen.getByRole("button", { name: "2 more on Wednesday 14 October" });
    more.focus();
    fireEvent.click(more);
    const dialog = await screen.findByRole("dialog", { name: "Wednesday 14 October" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it("dialog titles are 16px semibold heading colour", async () => {
    const titleOf = (dialog: HTMLElement) => document.getElementById(dialog.getAttribute("aria-labelledby")!)!;
    const cases: [string, ReactNode][] = [
      ["Plain", <Dialog open key="d"><DialogContent aria-describedby={undefined}><DialogTitle>Plain</DialogTitle></DialogContent></Dialog>],
      ["Confirm", <AlertDialog open key="a"><AlertDialogContent aria-describedby={undefined}><AlertDialogTitle>Confirm</AlertDialogTitle></AlertDialogContent></AlertDialog>],
      ["New project", <Modal title="New project" key="m"><p>Form</p></Modal>],
      ["Mark as done", <DoneDialog title="Poster" onCancel={() => {}} onSubmit={() => {}} key="done" />],
      ["Wednesday 14 October", <DayDialog day="2026-10-14" cards={[]} today="2026-10-08" onClose={() => {}} key="day" />],
      ["Thursday 8 October", <BriefDayDialog day="2026-10-08" items={[]} onClose={() => {}} key="brief" />],
      ["Add link", <LibraryDialog title="Add link" onClose={() => {}} key="lib"><p>Form</p></LibraryDialog>],
    ];
    for (const [name, el] of cases) {
      render(el);
      const dialog = name === "Confirm" ? await screen.findByRole("alertdialog", { name }) : await screen.findByRole("dialog", { name });
      const cls = titleOf(dialog).className.split(/\s+/);
      expect(cls, name).toEqual(expect.arrayContaining(["text-base", "font-semibold", "text-heading"]));
      cleanup();
    }
  });
});

describe("dialogs that stay mounted with a trigger", () => {
  // The content component renders while closed too, so the opener must be taken when the dialog opens, not when the
  // page mounts (after a client navigation focus sits on whatever link was clicked).
  const trigger = <Button variant="outline">Open</Button>;
  const cases: [string, "dialog" | "alertdialog", ReactNode][] = [
    ["Dialog", "dialog", <Dialog key="d"><DialogTrigger asChild>{trigger}</DialogTrigger><DialogContent aria-describedby={undefined}><DialogTitle>Panel</DialogTitle></DialogContent></Dialog>],
    ["Sheet", "dialog", <Sheet key="s"><SheetTrigger asChild>{trigger}</SheetTrigger><SheetContent aria-describedby={undefined}><SheetTitle>Panel</SheetTitle></SheetContent></Sheet>],
    ["AlertDialog", "alertdialog", <AlertDialog key="a"><AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger><AlertDialogContent aria-describedby={undefined}><AlertDialogTitle>Panel</AlertDialogTitle><AlertDialogCancel>Cancel</AlertDialogCancel></AlertDialogContent></AlertDialog>],
  ];

  it.each(cases)("%s returns focus to its trigger, not to what had focus when the page mounted", async (_name, role, el) => {
    const elsewhere = document.body.appendChild(document.createElement("button"));
    elsewhere.textContent = "Sidebar link";
    elsewhere.focus();
    try {
      render(el);
      const open = screen.getByRole("button", { name: "Open" });
      open.focus();
      fireEvent.click(open);
      const panel = await screen.findByRole(role, { name: "Panel" });
      await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole(role)).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(open));
    } finally {
      elsewhere.remove();
    }
  });
});
