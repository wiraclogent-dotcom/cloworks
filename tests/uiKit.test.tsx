// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Plus, Inbox } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Chip, BrandTag, CountPill } from "@/components/ui/Chip";
import { StatusChip } from "@/components/ui/StatusChip";
import { DeadlineChip } from "@/components/ui/DeadlineChip";
import { NeedsMotionChip } from "@/components/ui/NeedsMotionChip";
import { Avatar, AvatarStack, UnassignedAvatar } from "@/components/ui/Avatar";
import { FieldError, fieldClass } from "@/components/ui/Field";
import { RadioCards } from "@/components/ui/RadioCards";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { KpiTile } from "@/components/ui/KpiTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { tableClass } from "@/components/ui/table";
import { Divider } from "@/components/ui/Divider";
import { cn } from "@/components/ui/cn";
import { StatusBadge, NeedsMotionBadge } from "@/components/status";

afterEach(cleanup);

/** No component may carry a raw colour: only token classes. */
const noHex = (el: Element) => expect(el.outerHTML).not.toMatch(/#[0-9a-f]{6}\b|text-white|bg-white|text-black/i);

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", false, null, undefined, 0, "b")).toBe("a b");
  });
});

describe("Button", () => {
  it("renders a native button (type=button by default) with variant and size classes", () => {
    render(<Button variant="primary" size="sm">Save</Button>);
    const b = screen.getByRole("button", { name: "Save" });
    expect(b.getAttribute("type")).toBe("button");
    expect(b.className).toMatch(/bg-primary/);
    expect(b.className).toMatch(/h-8/);
    noHex(b);
  });
  it("loading: spinner, aria-busy, disabled, label kept", () => {
    render(<Button loading>Saving…</Button>);
    const b = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.querySelector("svg.animate-spin")).toBeTruthy();
  });
  it("buttonClass styles links the same way, per variant", () => {
    expect(buttonClass({ variant: "danger" })).toMatch(/bg-destructive/);
    expect(buttonClass({ variant: "secondary" })).toMatch(/border-border-strong/);
    expect(buttonClass({ variant: "ghost", size: "sm" })).toMatch(/h-8/);
    expect(buttonClass({ block: true })).toMatch(/w-full/);
    expect(buttonClass()).toMatch(/focus-visible:outline-ring/);
  });
  it("renders an icon before the label", () => {
    render(<Button icon={<Plus aria-hidden="true" />}>New</Button>);
    expect(screen.getByRole("button", { name: "New" }).querySelector("svg")).toBeTruthy();
  });
});

describe("IconButton", () => {
  it("uses aria-label as its name and tooltip", () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="Add item" icon={<Plus aria-hidden="true" />} onClick={onClick} />);
    const b = screen.getByRole("button", { name: "Add item" });
    expect(b.getAttribute("title")).toBe("Add item");
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Card", () => {
  it("renders a card with a header, h2 title and actions", () => {
    render(<Card data-testid="c"><CardHeader actions={<button>Edit</button>}><CardTitle>Details</CardTitle></CardHeader>Body</Card>);
    expect(screen.getByRole("heading", { level: 2, name: "Details" })).toBeTruthy();
    expect(screen.getByTestId("c").className).toMatch(/rounded-xl/);
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });
  it("padded=false drops the padding", () => {
    render(<Card padded={false} data-testid="c" />);
    expect(screen.getByTestId("c").className).not.toMatch(/\bp-4\b/);
  });
});

describe("PageHeader", () => {
  it("renders the page h1, count, description, switcher and actions", () => {
    render(<PageHeader title="Requests" count={42} description="All creative work" switcher={<span>switch</span>} actions={<a href="/n">New request</a>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Requests" })).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("All creative work")).toBeTruthy();
    expect(screen.getByText("switch")).toBeTruthy();
    expect(screen.getByRole("link", { name: "New request" })).toBeTruthy();
  });
});

describe("SegmentedControl", () => {
  it("link mode: nav with aria-current on the current segment", () => {
    render(<SegmentedControl label="View" value="table" items={[{ value: "board", label: "Board", href: "/b" }, { value: "table", label: "Table", href: "/t" }]} />);
    const nav = screen.getByRole("navigation", { name: "View" });
    expect(within(nav).getByRole("link", { name: "Table" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Board" }).getAttribute("aria-current")).toBeNull();
  });
  it("button mode: group with aria-pressed, calls onSelect", () => {
    const pick = vi.fn();
    render(<SegmentedControl label="Range" value="m" items={[{ value: "m", label: "Month", onSelect: () => {} }, { value: "y", label: "Year", onSelect: pick }]} />);
    expect(screen.getByRole("group", { name: "Range" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Month" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Year" }));
    expect(pick).toHaveBeenCalledOnce();
  });
});

describe("Chip / BrandTag / CountPill", () => {
  it("Chip carries its palette tone and uses tone tokens only", () => {
    render(<Chip tone="due-soon">Soon</Chip>);
    const c = screen.getByText("Soon");
    expect(c.getAttribute("data-tone")).toBe("due-soon");
    expect(c.className).toMatch(/bg-tone-tint/);
    expect(c.className).toMatch(/text-tone-text/);
    noHex(c);
  });
  it("BrandTag picks the brand tone, unknown brands neutral", () => {
    render(<><BrandTag name="Clogent" /><BrandTag name="Bubble Wash" /><BrandTag name="Acme" /></>);
    expect(screen.getByText("Clogent").getAttribute("data-tone")).toBe("tag-clogent");
    expect(screen.getByText("Bubble Wash").getAttribute("data-tone")).toBe("tag-bubble-wash");
    expect(screen.getByText("Acme").getAttribute("data-tone")).toBe("tag-neutral");
  });
  it("CountPill shows a tabular number", () => {
    render(<CountPill value={7} aria-label="7 requests" />);
    const p = screen.getByLabelText("7 requests");
    expect(p.textContent).toBe("7");
    expect(p.className).toMatch(/tabular-nums/);
  });
});

describe("StatusChip", () => {
  it.each([
    ["REQUESTED", "Requested", "requested"],
    ["ON_PROGRESS", "On progress", "in-progress"],
    ["FIRST_LOOK", "First look", "first-look"],
    ["DONE", "Done", "done"],
    ["CANCELLED", "Cancelled", "cancelled"],
    ["NOT_STARTED", "Not started", "requested"],
    ["IN_PROGRESS", "In progress", "in-progress"],
    ["IN_REVIEW", "In review", "first-look"],
    ["ON_HOLD", "On hold", "due-soon"],
  ] as const)("%s → label %s, tone %s, with a decorative icon", (status, label, tone) => {
    render(<StatusChip status={status} />);
    const chip = screen.getByText(label);
    expect(chip.getAttribute("data-tone")).toBe(tone);
    expect(chip.querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });
  it("StatusBadge (old name) still works", () => {
    render(<StatusBadge status="DONE" />);
    expect(screen.getByText("Done").getAttribute("data-tone")).toBe("done");
  });
});

describe("DeadlineChip", () => {
  it.each([
    [null, "No deadline", "none", "tag-neutral"],
    [-7, "Overdue by 7 days", "overdue", "overdue"],
    [-1, "Overdue by 1 day", "overdue", "overdue"],
    [0, "Due today", "due-soon", "due-soon"],
    [1, "1 day left", "due-soon", "due-soon"],
    [2, "2 days left", "due-soon", "due-soon"],
    [3, "3 days left", "on-track", "tag-neutral"],
  ] as const)("daysLeft %s → %s", (days, text, state, tone) => {
    render(<DeadlineChip daysLeft={days} />);
    const chip = screen.getByText(text);
    expect(chip.getAttribute("data-deadline")).toBe(state);
    expect(chip.getAttribute("data-tone")).toBe(tone);
    expect(chip.querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });
});

describe("NeedsMotionChip", () => {
  it("icon + text in the needs-motion tone; the old NeedsMotionBadge name renders the same chip", () => {
    render(<><NeedsMotionChip /><NeedsMotionBadge /></>);
    const chips = screen.getAllByText("Needs motion");
    expect(chips).toHaveLength(2);
    for (const c of chips) {
      expect(c.getAttribute("data-tone")).toBe("needs-motion");
      expect(c.querySelector("svg[aria-hidden='true']")).toBeTruthy();
    }
  });
});

describe("Avatar", () => {
  it("shows initials, is named by the person, and colours from the palette variables", () => {
    render(<Avatar name="Dimas Pandu" size="lg" />);
    const a = screen.getByRole("img", { name: "Dimas Pandu" });
    expect(a.textContent).toBe("DP");
    expect(a.getAttribute("style")).toMatch(/var\(--avatar-[1-8]-tint\)/);
    expect(a.className).toMatch(/size-9/);
  });
  it("decorative avatars are hidden from assistive tech", () => {
    const { container } = render(<Avatar name="Fafa" decorative ring />);
    const a = container.firstElementChild!;
    expect(a.getAttribute("aria-hidden")).toBe("true");
    expect(a.textContent).toBe("FA");
    expect(a.className).toMatch(/ring-2/);
  });
  it("UnassignedAvatar is a dashed circle named Unassigned", () => {
    render(<UnassignedAvatar />);
    const u = screen.getByRole("img", { name: "Unassigned" });
    expect(u.className).toMatch(/border-dashed/);
    expect(u.querySelector("svg")).toBeTruthy();
  });
  it("AvatarStack shows max avatars plus +N and announces every name", () => {
    render(<AvatarStack names={["Rina", "Cami", "Dimas", "Fafa", "Ibnu"]} max={3} label="Assignees" />);
    const stack = screen.getByRole("img", { name: "Assignees: Rina, Cami, Dimas, Fafa, Ibnu" });
    expect(stack.textContent).toContain("+2");
  });
});

describe("fieldClass / FieldError", () => {
  it("36px, input outline, focus ring; invalid swaps to the danger border", () => {
    expect(fieldClass()).toMatch(/h-9/);
    expect(fieldClass()).toMatch(/border-input/);
    expect(fieldClass()).toMatch(/focus-visible:outline-ring/);
    expect(fieldClass({ invalid: true })).toMatch(/border-danger/);
    expect(fieldClass({ kind: "textarea" })).not.toMatch(/h-9/);
  });
  it("FieldError renders icon + message with an id for aria-describedby, nothing when empty", () => {
    const { container } = render(<><input aria-label="Title" aria-invalid="true" aria-describedby="t-err" className={fieldClass({ invalid: true })} /><FieldError id="t-err">Enter a title.</FieldError><FieldError id="x" /></>);
    const msg = document.getElementById("t-err")!;
    expect(msg.textContent).toBe("Enter a title.");
    expect(msg.querySelector("svg[aria-hidden='true']")).toBeTruthy();
    expect(document.getElementById("x")).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
});

describe("RadioCards", () => {
  const options = [
    { value: "no", title: "No", description: "Static design only" },
    { value: "yes", title: "Yes, needs motion", description: "Video or animation" },
  ];
  it("is a fieldset/legend group of real radio inputs named by their card text", () => {
    render(<RadioCards name="needsMotion" legend="Does this task need motion?" options={options} defaultValue="no" />);
    expect(screen.getByRole("group", { name: "Does this task need motion?" })).toBeTruthy();
    const no = screen.getByRole("radio", { name: /^No/ }) as HTMLInputElement;
    const yes = screen.getByRole("radio", { name: /Yes, needs motion/ }) as HTMLInputElement;
    expect(no.checked).toBe(true);
    expect(yes.name).toBe("needsMotion");
    fireEvent.click(yes);
    expect(yes.checked).toBe(true);
    expect(no.checked).toBe(false);
  });
  it("controlled mode reports the chosen value", () => {
    const onChange = vi.fn();
    render(<RadioCards name="m" legend="Motion" options={options} value="no" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
    expect(onChange).toHaveBeenCalledWith("yes", expect.anything());
  });
});

describe("ProgressBar", () => {
  it("exposes progressbar semantics with label and values", () => {
    render(<ProgressBar label="Monthly target" value={6} max={8} />);
    const bar = screen.getByRole("progressbar", { name: "Monthly target" });
    expect(bar.getAttribute("aria-valuenow")).toBe("6");
    expect(bar.getAttribute("aria-valuemax")).toBe("8");
    expect(bar.getAttribute("aria-valuetext")).toBe("75%");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("75%");
  });
  it("over 100%: bar clamped, real value in text, check shown", () => {
    const { container } = render(<ProgressBar label="Target" value={12} max={8} valueText="12 of 8 tasks" />);
    const bar = screen.getByRole("progressbar", { name: "Target" });
    expect(bar.getAttribute("aria-valuenow")).toBe("8");
    expect(bar.getAttribute("aria-valuetext")).toBe("12 of 8 tasks");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(container.querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });
  it("never shows NaN for bad input", () => {
    const { container } = render(<ProgressBar label="X" value={Number.NaN} max={0} />);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});

describe("KpiTile", () => {
  it("label, big tabular value, sub-line and a decorative tinted icon", () => {
    const { container } = render(<KpiTile icon={<Inbox aria-hidden="true" />} label="Tasks done" value={12} sub="of 20 target" tone="in-progress" />);
    expect(screen.getByText("Tasks done")).toBeTruthy();
    expect(screen.getByText("12").className).toMatch(/tabular-nums/);
    expect(screen.getByText("of 20 target")).toBeTruthy();
    expect(container.querySelector("[data-tone='in-progress']")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("EmptyState", () => {
  it("headline, one line and an action", () => {
    render(<EmptyState icon={<Inbox aria-hidden="true" />} title="No requests yet" description="Create the first one." action={<a href="#new">New request</a>} />);
    expect(screen.getByText("No requests yet")).toBeTruthy();
    expect(screen.getByText("Create the first one.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "New request" })).toBeTruthy();
  });
});

describe("Alert", () => {
  it("danger is an alert; others are status; text is the message only", () => {
    render(<><Alert tone="danger">Could not save.</Alert><Alert tone="success">Saved.</Alert></>);
    expect(screen.getByRole("alert").textContent).toBe("Could not save.");
    expect(screen.getByRole("alert").getAttribute("data-tone")).toBe("cancelled");
    expect(screen.getByRole("status").getAttribute("data-tone")).toBe("done");
  });
  it("role={null} renders static text with title and icon", () => {
    const { container } = render(<Alert tone="warning" role={null} title="Heads up">Due soon.</Alert>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Heads up")).toBeTruthy();
    expect(container.querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4 w-40" />);
    expect(container.firstElementChild!.getAttribute("aria-hidden")).toBe("true");
    expect(container.firstElementChild!.className).toMatch(/animate-pulse/);
  });
});

describe("tableClass", () => {
  it("sticky header, row hover, compact density", () => {
    const t = tableClass();
    expect(t.th).toMatch(/sticky top-0/);
    expect(t.tr).toMatch(/hover:/);
    expect(tableClass({ compact: true }).td).toMatch(/py-1\.5/);
    expect(t.td).toMatch(/py-2\.5/);
  });
  it("renders a semantic table with the classes", () => {
    const t = tableClass();
    render(<div className={t.wrapper}><table className={t.table}><thead><tr><th scope="col" className={t.th}>Title</th></tr></thead><tbody><tr className={t.tr}><td className={t.td}>A</td></tr></tbody></table></div>);
    expect(screen.getByRole("columnheader", { name: "Title" }).className).toMatch(/sticky/);
  });
});

describe("Divider", () => {
  it("plain hr, or a labelled separator", () => {
    const { container } = render(<><Divider /><Divider label="or" /></>);
    expect(container.querySelector("hr")).toBeTruthy();
    expect(screen.getByRole("separator", { name: "or" })).toBeTruthy();
  });
});
