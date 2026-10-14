// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { DndContext, MouseSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { BoardCard } from "@/components/BoardCard";
import type { RequestRow } from "@/lib/requests";

const card: RequestRow = {
  id: "c1", title: "Banner", status: "FIRST_LOOK", brandName: "BrandA", divisionName: "DivX", requesterName: "Rina", assignees: [{ id: "cami", name: "Cami" }],
  requestedAt: new Date("2026-10-01T00:00:00Z"), deadline: null, outputCount: 1, daysLeft: null, needsMotion: false,
};

function Harness({ canMove, onStart }: { canMove: boolean; onStart: () => void }) {
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  return (
    <DndContext sensors={sensors} onDragStart={onStart}>
      <ul><BoardCard card={card} canMove={canMove} busy={false} dragging={false} /></ul>
    </DndContext>
  );
}
afterEach(cleanup);

const two = [{ id: "fafa", name: "Fafa" }, { id: "dimas", name: "Dimas" }];
const four = [...two, { id: "cami", name: "Cami" }, { id: "eko", name: "Eko" }];
const renderCard = (assignees: RequestRow["assignees"]) =>
  render(<DndContext><ul><BoardCard card={{ ...card, assignees }} canMove={false} busy={false} dragging={false} /></ul></DndContext>);

describe("BoardCard shared requests", () => {
  it("a shared card shows stacked avatars, the pair label, a Shared chip and the accent hook", () => {
    renderCard(two);
    const li = document.querySelector("[data-card]") as HTMLElement;
    expect(li.hasAttribute("data-shared")).toBe(true);
    expect(li.className).toContain("before:bg-ring");
    const who = li.querySelector("[data-card-assignee]") as HTMLElement;
    expect(who.getAttribute("data-card-assignee")).toBe("shared");
    expect(who.textContent).toContain("Fafa & Dimas");
    expect(screen.getByRole("img", { name: "Assignees: Fafa, Dimas" })).toBeTruthy();
    expect(within(li).getByText("Shared")).toBeTruthy();
  });

  it("four assignees read 4 people with a +1 disc, and the label can shrink", () => {
    renderCard(four);
    const who = document.querySelector("[data-card-assignee='shared']") as HTMLElement;
    expect(who.textContent).toContain("4 people");
    expect(who.textContent).toContain("+1");
    expect(screen.getByRole("img", { name: "Assignees: Fafa, Dimas, Cami, Eko" })).toBeTruthy();
    const label = within(who).getByText("4 people");
    expect(label.className).toContain("truncate");
    expect(who.className).toContain("min-w-0");
  });

  it("a single-assignee card is unchanged: assigned, no chip, no accent hook", () => {
    renderCard([{ id: "cami", name: "Cami" }]);
    const li = document.querySelector("[data-card]") as HTMLElement;
    expect(li.hasAttribute("data-shared")).toBe(false);
    expect(li.querySelector("[data-card-assignee]")!.getAttribute("data-card-assignee")).toBe("assigned");
    expect(screen.getByRole("img", { name: "Assignee: Cami" })).toBeTruthy();
    expect(within(li).queryByText("Shared")).toBeNull();
  });

  it("an unassigned card is unchanged", () => {
    renderCard([]);
    const li = document.querySelector("[data-card]") as HTMLElement;
    expect(li.hasAttribute("data-shared")).toBe(false);
    expect(li.querySelector("[data-card-assignee]")!.getAttribute("data-card-assignee")).toBe("unassigned");
    expect(screen.getByRole("img", { name: "Assignee: Unassigned" })).toBeTruthy();
  });
});

describe("BoardCard", () => {
  it("renders no select / Move to… control", () => {
    render(<Harness canMove={true} onStart={() => {}} />);
    expect(document.querySelector("select")).toBeNull();
    expect(screen.queryByText("Move to…")).toBeNull();
  });

  it("the whole card is the pointer drag surface for movers (drag from the body, past 6px)", () => {
    const onStart = vi.fn();
    render(<Harness canMove={true} onStart={onStart} />);
    const li = document.querySelector("[data-card]") as HTMLElement;
    expect(li.getAttribute("data-draggable")).toBe("true");
    const body = screen.getByTitle("Requester: Rina"); // Phase B1: requester line is avatar + name (was the text "Requester: Rina")
    fireEvent.mouseDown(body, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(document, { clientX: 12, clientY: 10 });
    expect(onStart).not.toHaveBeenCalled(); // under the 6px activation distance: still a click
    fireEvent.mouseMove(document, { clientX: 30, clientY: 10 });
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.mouseUp(document);
  });

  it("read-only users get no drag surface and no handle", () => {
    const onStart = vi.fn();
    render(<Harness canMove={false} onStart={onStart} />);
    const li = document.querySelector("[data-card]") as HTMLElement;
    expect(li.hasAttribute("data-draggable")).toBe(false);
    expect(screen.queryByRole("button", { name: /drag/i })).toBeNull();
    fireEvent.mouseDown(screen.getByTitle("Requester: Rina"), { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(document, { clientX: 60, clientY: 10 });
    expect(onStart).not.toHaveBeenCalled();
  });

  it("keeps the title a normal link and the keyboard handle works (Space lifts the card)", () => {
    const onStart = vi.fn();
    render(<Harness canMove={true} onStart={onStart} />);
    expect(screen.getByRole("link", { name: "Banner" }).getAttribute("href")).toBe("/requests/c1");
    // Enter on the link must not start a keyboard drag
    fireEvent.keyDown(screen.getByRole("link", { name: "Banner" }), { code: "Enter", key: "Enter" });
    expect(onStart).not.toHaveBeenCalled();
    const handle = screen.getByRole("button", { name: /drag “Banner”/i });
    act(() => { fireEvent.keyDown(handle, { code: "Space", key: " " }); });
    return new Promise<void>((resolve) => setTimeout(() => { expect(onStart).toHaveBeenCalledTimes(1); resolve(); }, 20));
  });

  it("dims the original while it is being dragged", () => {
    render(<DndContext><ul><BoardCard card={card} canMove={true} busy={false} dragging={true} /></ul></DndContext>);
    expect((document.querySelector("[data-card]") as HTMLElement).className).toMatch(/opacity-40/);
  });
});
