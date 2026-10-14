// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { Calendar } from "@/components/shadcn/calendar";
import { DatePicker } from "@/components/ui/DatePicker";
import { fieldClass } from "@/components/ui/Field";

// jsdom lacks these; Radix popover positioning calls them.
class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe("Calendar", () => {
  it("starts the week on Monday and shows the month of `month`", () => {
    render(<Calendar mode="single" month={local(2026, 10, 1)} />);
    const heads = [...document.querySelectorAll("th")].map((h) => h.textContent);
    expect(heads).toHaveLength(7);
    expect(heads[0]).toMatch(/^Mo/);
    expect(heads[6]).toMatch(/^Su/);
    expect(screen.getByText("October 2026")).toBeTruthy();
  });

  it("marks the selected day with the primary tokens and today with a ring", () => {
    render(<Calendar mode="single" month={local(2026, 10, 1)} selected={local(2026, 10, 19)} today={local(2026, 10, 14)} />);
    const selected = screen.getByRole("gridcell", { selected: true });
    expect(selected.textContent).toBe("19");
    const btn = within(selected).getByRole("button");
    expect(btn.className).toMatch(/bg-primary/);
    expect(btn.className).toMatch(/text-primary-foreground/);
    const todayCell = screen.getAllByRole("gridcell").find((c) => c.textContent === "14" && !c.hasAttribute("data-outside"))!;
    expect(todayCell.getAttribute("data-today")).toBe("true");
    expect(within(todayCell).getByRole("button").className).toMatch(/outline-ring|ring/);
  });

  it("uses only design tokens (no raw colours) and the app focus ring", () => {
    const { container } = render(<Calendar mode="single" month={local(2026, 10, 1)} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/(?:bg|text|border)-(?:white|black|gray|slate|zinc|neutral|stone|red|blue|green)-?\d*/);
    const btn = screen.getAllByRole("button").find((b) => /October 1st/.test(b.getAttribute("aria-label") ?? "") || b.textContent === "1")!;
    expect(btn.className).toMatch(/focus-visible:outline-2/);
    expect(btn.className).toMatch(/focus-visible:outline-ring/);
  });

  it("dims outside and disabled days", () => {
    render(<Calendar mode="single" month={local(2026, 10, 1)} disabled={{ before: local(2026, 10, 10) }} />);
    const day5 = screen.getAllByRole("gridcell").find((c) => c.textContent === "5" && !c.hasAttribute("data-outside"))!;
    expect(within(day5).getByRole("button").hasAttribute("disabled")).toBe(true);
    const outside = screen.getAllByRole("gridcell").find((c) => c.hasAttribute("data-outside"))!;
    expect(outside.className).toMatch(/text-foreground-muted/);
  });

  it("has previous/next month buttons", () => {
    render(<Calendar mode="single" defaultMonth={local(2026, 10, 1)} />);
    expect(screen.getByRole("button", { name: /previous month/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    expect(screen.getByText("November 2026")).toBeTruthy();
  });
});

function open() {
  fireEvent.click(screen.getByRole("button", { name: /Due/ }));
}
const dayBtn = (day: number) =>
  screen.getAllByRole("gridcell").filter((c) => !c.hasAttribute("data-outside")).find((c) => c.textContent === String(day))!.querySelector("button")!;

describe("DatePicker", () => {
  it("shows the Jakarta-formatted date and a placeholder when empty", () => {
    const { rerender } = render(<DatePicker aria-label="Due" value="2026-10-19" />);
    expect(screen.getByRole("button", { name: /Due/ }).textContent).toContain("19 Oct 2026");
    rerender(<DatePicker aria-label="Due" value={null} placeholder="Pick a day" />);
    expect(screen.getByRole("button", { name: /Due/ }).textContent).toContain("Pick a day");
  });

  it("formats exactly like the rest of the app (tables): '22 Sep 2026', no 'Sept', no zero-padded day", async () => {
    const { formatJakartaDate } = await import("@/lib/projects");
    const { formatJakartaDay } = await import("@/lib/projectTasks");
    render(<DatePicker aria-label="Due" value="2026-09-22" />);
    const text = screen.getByRole("button", { name: /Due/ }).textContent;
    expect(text).toBe("22 Sep 2026");
    expect(text).toBe(formatJakartaDate(new Date("2026-09-22T00:00:00+07:00")));
    expect(formatJakartaDay("2026-09-22")).toBe("22 Sep 2026");
    expect(formatJakartaDay("2026-10-08")).toBe("8 Oct 2026");
    expect(formatJakartaDay(new Date("2026-10-08T00:00:00+07:00"))).toBe("8 Oct 2026");
  });

  it("looks like a field: same classes as fieldClass()", () => {
    render(<DatePicker aria-label="Due" value={null} />);
    const cls = screen.getByRole("button", { name: /Due/ }).className;
    for (const token of ["rounded-lg", "border-input", "bg-card", "h-9", "px-3", "text-sm", "focus-visible:outline-ring"]) {
      expect(cls).toContain(token);
    }
    expect(fieldClass()).toContain("h-9");
  });

  it("size sm matches the small field height and invalid uses the danger border", () => {
    render(<DatePicker aria-label="Due" value={null} size="sm" aria-invalid />);
    const btn = screen.getByRole("button", { name: /Due/ });
    expect(btn.className).toContain("h-8");
    expect(btn.className).toContain("border-danger");
    expect(btn.getAttribute("aria-invalid")).toBe("true");
  });

  it("renders a hidden input named `name` holding YYYY-MM-DD (empty when no value)", () => {
    const { container, rerender } = render(<DatePicker name="dueDate" aria-label="Due" value="2026-10-19" />);
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"][name="dueDate"]')!;
    expect(hidden.value).toBe("2026-10-19");
    rerender(<DatePicker name="dueDate" aria-label="Due" value={null} />);
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"][name="dueDate"]')!.value).toBe("");
  });

  it("renders no hidden input without a name", () => {
    const { container } = render(<DatePicker aria-label="Due" value={null} />);
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
  });

  it("picking a day updates the hidden input, emits the ISO string and closes", () => {
    const onChange = vi.fn();
    const { container } = render(<DatePicker name="dueDate" aria-label="Due" value="2026-10-19" onChange={onChange} />);
    open();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(dayBtn(25));
    expect(onChange).toHaveBeenCalledWith("2026-10-25");
    expect(container.querySelector<HTMLInputElement>('input[name="dueDate"]')!.value).toBe("2026-10-25");
    expect(screen.getByRole("button", { name: /Due/ }).textContent).toContain("25 Oct 2026");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape closes without changing the value", () => {
    const onChange = vi.fn();
    render(<DatePicker aria-label="Due" value="2026-10-19" onChange={onChange} />);
    open();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("the trigger is a real button (Enter/Space open it) and moves focus into the calendar when open", () => {
    render(<DatePicker aria-label="Due" value="2026-10-19" />);
    const trigger = screen.getByRole("button", { name: /Due/ });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    open();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("Clear (allowClear) empties the value and emits null; absent without allowClear", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<DatePicker name="d" aria-label="Due" value="2026-10-19" allowClear onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear Due" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(container.querySelector<HTMLInputElement>('input[name="d"]')!.value).toBe("");
    expect(screen.queryByRole("button", { name: "Clear Due" })).toBeNull();
    rerender(<DatePicker name="d" aria-label="Due" value="2026-10-19" />);
    expect(screen.queryByRole("button", { name: "Clear Due" })).toBeNull();
  });

  it("Clear returns focus to the trigger", () => {
    render(<DatePicker aria-label="Due" value="2026-10-19" allowClear />);
    fireEvent.click(screen.getByRole("button", { name: "Clear Due" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Due/ }));
  });

  it("names the popover dialog after the field", () => {
    const { unmount } = render(<DatePicker aria-label="Due" value={null} />);
    open();
    expect(screen.getByRole("dialog", { name: "Choose Due" })).toBeTruthy();
    unmount();
    render(<><span id="lbl">Start date</span><DatePicker aria-labelledby="lbl" value={null} /></>);
    fireEvent.click(screen.getByRole("button", { name: /Start date/ }));
    expect(screen.getByRole("dialog", { name: /Start date/ })).toBeTruthy();
  });

  it("a disabled picker does not submit its hidden input", () => {
    const { container } = render(<form><DatePicker name="d" aria-label="Due" value="2026-10-19" disabled /></form>);
    const hidden = container.querySelector<HTMLInputElement>('input[name="d"]')!;
    expect(hidden.disabled).toBe(true);
    expect([...new FormData(container.querySelector("form")!).keys()]).not.toContain("d");
  });

  it("respects min and max", () => {
    render(<DatePicker aria-label="Due" value="2026-10-19" min="2026-10-10" max="2026-10-25" />);
    open();
    expect(dayBtn(9).hasAttribute("disabled")).toBe(true);
    expect(dayBtn(10).hasAttribute("disabled")).toBe(false);
    expect(dayBtn(26).hasAttribute("disabled")).toBe(true);
  });

  it("disabled trigger does not open", () => {
    render(<DatePicker aria-label="Due" value={null} disabled />);
    fireEvent.click(screen.getByRole("button", { name: /Due/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("follows a changed value prop", () => {
    const { container, rerender } = render(<DatePicker name="d" aria-label="Due" value="2026-10-19" />);
    rerender(<DatePicker name="d" aria-label="Due" value="2026-11-02" />);
    expect(container.querySelector<HTMLInputElement>('input[name="d"]')!.value).toBe("2026-11-02");
    expect(screen.getByRole("button", { name: /Due/ }).textContent).toContain("2 Nov 2026");
  });

  describe.each(["UTC", "Asia/Jakarta", "America/Los_Angeles", "Pacific/Kiritimati"])("in TZ=%s", (tz) => {
    const prev = process.env.TZ;
    beforeEach(() => { process.env.TZ = tz; });
    afterEach(() => { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; });

    it("no off-by-one: shows and emits the same calendar day", () => {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz); // the TZ switch really took effect
      const onChange = vi.fn();
      const { container } = render(<DatePicker name="d" aria-label="Due" value="2026-10-19" onChange={onChange} />);
      expect(screen.getByRole("button", { name: /Due/ }).textContent).toContain("19 Oct 2026");
      expect(container.querySelector<HTMLInputElement>('input[name="d"]')!.value).toBe("2026-10-19");
      open();
      expect(within(screen.getByRole("gridcell", { selected: true })).getByRole("button").textContent).toBe("19");
      fireEvent.click(dayBtn(1));
      expect(onChange).toHaveBeenLastCalledWith("2026-10-01");
      open();
      fireEvent.click(dayBtn(31));
      expect(onChange).toHaveBeenLastCalledWith("2026-10-31");
    });

    it("highlights today as the Jakarta day (around midnight UTC)", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-13T20:30:00Z")); // 14 Oct 03:30 in Jakarta
      render(<DatePicker aria-label="Due" value={null} />);
      open();
      const today = screen.getAllByRole("gridcell").find((c) => c.getAttribute("data-today") === "true")!;
      expect(today.textContent).toBe("14");
      expect(screen.getByText("October 2026")).toBeTruthy();
    });
  });
});
