// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back }) }));

import { Modal } from "@/components/ui/Modal";

beforeEach(() => {
  back.mockReset();
  // jsdom has no showModal/close on <dialog>.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); document.documentElement.style.overflow = ""; });

describe("Modal (route modal)", () => {
  it("side=right opens as a labelled panel with the actions next to Close", () => {
    render(<Modal side="right" title="Request" actions={<button type="button">Open full page</button>}><h1>Banner</h1></Modal>);
    const dialog = screen.getByRole("dialog", { name: "Request" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.className).toContain("ml-auto");
    expect(screen.getByRole("button", { name: "Open full page" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Banner" })).toBeTruthy();
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("goes back in history on Close, Esc and a backdrop click, but not on a click inside", () => {
    render(<Modal side="right" title="Request"><p>Body</p></Modal>);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    fireEvent.click(screen.getByText("Body"));
    fireEvent.click(screen.getByRole("dialog"));
    expect(back).toHaveBeenCalledTimes(3);
  });

  it("closes the dialog and restores scrolling when unmounted (a hidden route must not keep the top layer)", () => {
    const { unmount } = render(<Modal title="New project"><p>Form</p></Modal>);
    const dialog = screen.getByRole("dialog", { name: "New project" });
    unmount();
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
  });
});
