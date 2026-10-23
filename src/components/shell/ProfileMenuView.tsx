"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ChevronsUpDown, CircleHelp, LoaderCircle, LogOut, Moon, Settings } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useDarkMode } from "../ui/darkMode";
import { cn, focusRing } from "../ui/cn";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";

/**
 * Profile card at the bottom of the sidebar: photo, name and "title · department" (the app role when both are empty);
 * in the rail only the photo. It opens upwards: Settings (account and, for admins, the admin tabs), Help center, Dark
 * mode and Sign out. Radix gives keyboard support, focus return and Esc for free. `signOut` is a server action from
 * the server wrapper (`ProfileMenu`).
 */
export function ProfileMenuView({ name, title, department, roleLabel, signOut }: {
  name: string; title: string | null; department: string | null; roleLabel: string; signOut: () => Promise<void>;
}) {
  const { dark, flip } = useDarkMode();
  const [signingOut, startSignOut] = useTransition();
  const detail = [title, department].filter((s) => s?.trim()).join(" · ") || roleLabel;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger aria-label={`Account menu for ${name}`} title={name}
        className={cn("sb-item sb-frame flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border p-2 text-left transition-colors hover:bg-sidebar-hover data-[state=open]:bg-sidebar-hover", focusRing)}>
        <Avatar name={name} size="lg" decorative />
        <span className="sb-label min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold text-sidebar-foreground">{name}</span>
          <span className="block truncate text-xs text-sidebar-foreground-secondary">{detail}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" strokeWidth={1.75} className="sb-label size-4 shrink-0 text-sidebar-foreground-secondary" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings aria-hidden="true" />Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/help"><CircleHelp aria-hidden="true" />Help center</Link>
        </DropdownMenuItem>
        {/* Stays open on toggle so the change is visible; the knob mirrors the Settings switch. */}
        <DropdownMenuCheckboxItem indicator={false} checked={dark} onCheckedChange={flip} onSelect={(e) => e.preventDefault()}>
          <Moon aria-hidden="true" />
          <span className="flex-1">Dark mode</span>
          <span aria-hidden="true" className={cn("relative h-5 w-9 rounded-full transition-colors", dark ? "bg-toggle-night" : "bg-border-strong")}>
            <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-card transition-transform motion-reduce:transition-none", dark && "translate-x-4")} />
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {/* Not a <form>: choosing an item closes the menu, which unmounted the form before the browser could submit it.
            The menu stays open showing progress until the redirect lands. */}
        <DropdownMenuItem disabled={signingOut}
          onSelect={(e) => { e.preventDefault(); startSignOut(() => signOut()); }}>
          {signingOut ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <LogOut aria-hidden="true" />}
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
