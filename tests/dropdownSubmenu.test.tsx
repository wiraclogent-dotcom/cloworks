// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";

class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
afterEach(cleanup);

describe("DropdownMenuSubContent", () => {
  // The menu content scrolls (overflow-y: auto) and animates (a transform), which makes it the containing block of a
  // fixed-position child: a submenu rendered inside it was clipped away (Notes › Move to folder showed nothing).
  it("renders the submenu outside the parent menu, so the parent's scroll box cannot clip it", () => {
    render(
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent><DropdownMenuItem>Nested</DropdownMenuItem></DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const main = document.querySelector("[data-slot=dropdown-menu-content]")!;
    const sub = document.querySelector("[data-slot=dropdown-menu-sub-content]")!;
    expect(sub).toBeTruthy();
    expect(main.contains(sub)).toBe(false);
  });
});
