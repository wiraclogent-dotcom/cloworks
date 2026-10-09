"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { CircleHelp, LogOut, Moon, Settings } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useDarkMode } from "../ui/darkMode";
import { cn, focusRing } from "../ui/cn";

const itemClass =
  "flex h-9 w-full cursor-default items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground outline-none select-none data-[highlighted]:bg-surface-muted [&_svg]:size-4 [&_svg]:text-foreground-secondary";

/**
 * Top-right profile menu on every page: who is signed in, Account settings, Help center, Dark mode and Sign out (these
 * used to sit at the bottom of the sidebar). Radix gives keyboard support, focus return and Esc for free. `signOut` is
 * a server action from the server wrapper (`ProfileMenu`).
 */
export function ProfileMenuView({ name, roleLabel, signOut }: { name: string; roleLabel: string; signOut: () => Promise<void> }) {
  const { dark, flip } = useDarkMode();
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger aria-label={`Account menu for ${name}`} title={name}
        className={cn("inline-flex size-9 items-center justify-center rounded-full transition-opacity hover:opacity-85", focusRing)}>
        <Avatar name={name} size="lg" decorative />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6}
          className="z-50 w-60 rounded-xl border border-border bg-background p-1.5 text-foreground shadow-raised">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar name={name} size="md" decorative />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-foreground-secondary">{roleLabel}</p>
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/settings"><Settings aria-hidden="true" />Account settings</Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/help"><CircleHelp aria-hidden="true" />Help center</Link>
          </DropdownMenu.Item>
          {/* Stays open on toggle so the change is visible; the knob mirrors the Settings switch. */}
          <DropdownMenu.CheckboxItem checked={dark} onCheckedChange={flip} onSelect={(e) => e.preventDefault()} className={itemClass}>
            <Moon aria-hidden="true" />
            <span className="flex-1">Dark mode</span>
            <span aria-hidden="true" className={cn("relative h-5 w-9 rounded-full transition-colors", dark ? "bg-toggle-night" : "bg-border-strong")}>
              <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-card transition-transform motion-reduce:transition-none", dark && "translate-x-4")} />
            </span>
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <form action={signOut}>
            <DropdownMenu.Item asChild className={itemClass}>
              <button type="submit"><LogOut aria-hidden="true" />Sign out</button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
