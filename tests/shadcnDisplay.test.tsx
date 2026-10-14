// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";
import { Separator } from "@/components/shadcn/separator";
import { Progress } from "@/components/shadcn/progress";
import { Avatar, AvatarStack, UnassignedAvatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** jsdom never loads images; Radix Avatar shows the photo only once `new Image()` reports it loaded. */
function photosLoad() {
  vi.stubGlobal("Image", class { complete = true; naturalWidth = 1; addEventListener() {} removeEventListener() {} });
}

describe("Skeleton", () => {
  it("is a pulsing placeholder hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4 w-40" />);
    const s = container.firstElementChild!;
    expect(s.getAttribute("aria-hidden")).toBe("true");
    expect(s.hasAttribute("data-skeleton")).toBe(true);
    expect(s.className).toMatch(/animate-pulse/);
    expect(s.className).toMatch(/rounded-md/);
    expect(s.className).toMatch(/bg-border/);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("other shapes come from className, the last radius wins", () => {
    const { container } = render(<><Skeleton className="size-7 rounded-full" /><Skeleton className="h-9 rounded-xl" /></>);
    const [a, b] = Array.from(container.children);
    expect(a.className).toMatch(/rounded-full/);
    expect(a.className).not.toMatch(/rounded-md/);
    expect(b.className).toMatch(/rounded-xl/);
    expect(b.className).not.toMatch(/rounded-md/);
  });
});

describe("Spinner", () => {
  it("is announced as Loading", () => {
    render(<Spinner />);
    const s = screen.getByRole("status", { name: "Loading" });
    expect(s.getAttribute("class")).toMatch(/animate-spin/);
  });

  it("can be hidden when something else announces the state", () => {
    const { container } = render(<Spinner aria-hidden="true" />);
    expect(screen.queryByRole("status")).toBeNull();
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.hasAttribute("aria-label")).toBe(false);
  });
});

describe("Separator", () => {
  it("is decorative by default and a real separator when asked", () => {
    const { container } = render(<><Separator /><Separator decorative={false} orientation="vertical" /></>);
    const [a, b] = Array.from(container.children);
    expect(a.getAttribute("role")).toBe("none");
    expect(a.className).toMatch(/bg-border/);
    expect(b.getAttribute("role")).toBe("separator");
    expect(b.getAttribute("aria-orientation")).toBe("vertical");
  });
});

describe("Progress", () => {
  it("has progressbar semantics and a fill as wide as value/max", () => {
    render(<Progress aria-label="Upload" value={6} max={8} indicatorClassName="bg-chart-done" />);
    const bar = screen.getByRole("progressbar", { name: "Upload" });
    expect(bar.getAttribute("aria-valuenow")).toBe("6");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("8");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("75%");
    expect(fill.className).toMatch(/bg-chart-done/);
    expect(fill.className).not.toMatch(/bg-primary/);
  });

  it("without a value the fill is empty", () => {
    render(<Progress aria-label="Wait" value={null} />);
    expect((screen.getByRole("progressbar").firstElementChild as HTMLElement).style.width).toBe("0%");
  });
});

describe("Avatar (kit, on shadcn Avatar)", () => {
  it("shows initials, is named by the person, and colours from the palette variables", () => {
    render(<Avatar name="Dimas Pandu" size="lg" />);
    const a = screen.getByRole("img", { name: "Dimas Pandu" });
    expect(a.textContent).toBe("DP");
    expect(a.getAttribute("title")).toBe("Dimas Pandu");
    expect(a.getAttribute("data-slot")).toBe("avatar");
    expect(a.getAttribute("style")).toMatch(/var\(--avatar-[1-8]-tint\)/);
    expect(a.getAttribute("style")).toMatch(/var\(--avatar-[1-8]-text\)/);
    expect(a.className).toMatch(/size-9/);
    expect(a.className).toMatch(/rounded-full/);
  });

  it("the initials keep the palette tint (the fallback does not paint over it)", () => {
    render(<Avatar name="Dimas Pandu" />);
    const fallback = screen.getByRole("img", { name: "Dimas Pandu" }).querySelector("[data-slot='avatar-fallback']")!;
    expect(fallback.className).toMatch(/bg-transparent/);
    expect(fallback.className).not.toMatch(/\bbg-muted\b/);
  });

  it("decorative avatars are hidden from assistive tech", () => {
    const { container } = render(<Avatar name="Fafa" decorative ring />);
    const a = container.firstElementChild!;
    expect(a.getAttribute("aria-hidden")).toBe("true");
    expect(a.hasAttribute("role")).toBe(false);
    expect(a.textContent).toBe("FA");
    expect(a.className).toMatch(/ring-2/);
  });

  it("an empty name is hidden, never role=img with an empty label", () => {
    const { container } = render(<Avatar name="" />);
    const el = container.firstElementChild!;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.hasAttribute("aria-label")).toBe(false);
    expect(el.hasAttribute("role")).toBe(false);
    expect(el.hasAttribute("title")).toBe(false);
  });

  it("shows the photo once it has loaded, named by the person", () => {
    photosLoad();
    render(<Avatar name="Wira Budi" src="/api/avatar/u1?v=1" />);
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/api/avatar/u1?v=1");
    expect(img?.getAttribute("alt") ?? "").toBe("");
    const a = screen.getByRole("img", { name: "Wira Budi" });
    expect(a.textContent).toBe("");
  });

  it("shows the initials while the photo has not loaded (and when it fails)", () => {
    render(<Avatar name="Wira Budi" src="/api/avatar/u1?v=1" />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Wira Budi" }).textContent).toBe("WB");
  });

  it("falls back to initials when there is no photo", () => {
    render(<Avatar name="Wira Budi" src={null} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Wira Budi" }).textContent).toBe("WB");
  });

  it("UnassignedAvatar is a dashed circle named Unassigned, or hidden when decorative", () => {
    const { container } = render(<><UnassignedAvatar /><UnassignedAvatar decorative /></>);
    const u = screen.getByRole("img", { name: "Unassigned" });
    expect(u.className).toMatch(/border-dashed/);
    expect(u.querySelector("svg")).toBeTruthy();
    expect(container.children[1].getAttribute("aria-hidden")).toBe("true");
  });

  it("AvatarStack shows max avatars plus +N and announces every name once", () => {
    render(<AvatarStack names={["Rina", "Cami", "Dimas", "Fafa", "Ibnu"]} max={3} label="Assignees" />);
    const stack = screen.getByRole("img", { name: "Assignees: Rina, Cami, Dimas, Fafa, Ibnu" });
    expect(stack.textContent).toContain("+2");
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});

describe("ProgressBar (kit, on shadcn Progress)", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("exposes progressbar semantics with label and values", () => {
    render(<ProgressBar label="Monthly target" value={6} max={8} />);
    const bar = screen.getByRole("progressbar", { name: "Monthly target" });
    expect(bar.getAttribute("aria-valuenow")).toBe("6");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("8");
    expect(bar.getAttribute("aria-valuetext")).toBe("75%");
    expect(bar.getAttribute("data-slot")).toBe("progress");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("75%");
    expect((bar.firstElementChild as HTMLElement).className).toMatch(/bg-chart-done/);
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("over 100%: bar clamped, real value in text, check shown", () => {
    const { container } = render(<ProgressBar label="Target" value={12} max={8} valueText="12 of 8 tasks" />);
    const bar = screen.getByRole("progressbar", { name: "Target" });
    expect(bar.getAttribute("aria-valuenow")).toBe("8");
    expect(bar.getAttribute("aria-valuetext")).toBe("12 of 8 tasks");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(container.querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });

  it("never shows NaN for bad input, and Radix does not complain", () => {
    const { container } = render(<ProgressBar label="X" value={Number.NaN} max={0} />);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    const bar = screen.getByRole("progressbar", { name: "X" });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect(bar.getAttribute("aria-valuetext")).toBe("0%");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("hideLabel keeps the accessible name but not the visible label", () => {
    render(<ProgressBar label="Quiet" value={1} max={4} hideLabel />);
    expect(screen.getByRole("progressbar", { name: "Quiet" })).toBeTruthy();
    expect(screen.queryByText("Quiet")).toBeNull();
  });
});
