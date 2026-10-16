"use client";

import { useEffect, useRef, useState, useSyncExternalStore, ViewTransition, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { RAIL_DEFAULT_QUERY, setSidebarCollapsed, sidebarIsCollapsed } from "@/lib/theme";
import { Button } from "@/components/shadcn/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/shadcn/sheet";
import { LogoMark } from "@/components/ui/LogoMark";
import { sidebarRowClass } from "./classes";

const SIDEBAR_ID = "app-sidebar";
const DRAWER_ID = "app-drawer";

function subscribeCollapsed(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sidebar"] });
  // The width-based default (no stored choice) changes with the viewport.
  const mq = typeof window.matchMedia === "function" ? window.matchMedia(RAIL_DEFAULT_QUERY) : null;
  mq?.addEventListener?.("change", cb);
  return () => { mo.disconnect(); mq?.removeEventListener?.("change", cb); };
}
// Client snapshot only; while hydrating React uses the server snapshot (false), so the first render matches the HTML.
const getCollapsed = sidebarIsCollapsed;

/**
 * Client frame of the signed-in app: white V3 sidebar (232px, collapsible to a 64px rail on desktop, remembered in
 * localStorage `ct-sidebar`), slim top bar + off-canvas drawer (shadcn `Sheet` from the left) below 768px, skip link
 * and `<main id="main">`. The server AppShell passes in the nav, footer and workspace name (permission checks and reads
 * stay on the server).
 *
 * The sidebar's parts render in exactly one place: the desktop `<aside>` (CSS-hidden below 768px) while the drawer is
 * closed, the drawer while it is open, so ids and landmarks are never doubled. The drawer is closed on the server and
 * in the first client render, so hydration never sees it.
 */
export function AppFrame({ nav, footer, workspace, profile, children }: {
  nav: ReactNode; footer?: ReactNode; workspace?: ReactNode;
  /** The profile menu, pinned to the top-right of the content, in the row every PageHeader top bar leaves free. */
  profile?: ReactNode;
  children: ReactNode;
}) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, () => false);
  const [open, setOpen] = useState(false);
  // Set when the drawer closes because the page changes (a link was followed, the window grew past 768px): focus then
  // stays where the navigation puts it instead of going back to the menu button.
  const leaving = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Growing past the mobile breakpoint turns the drawer back into the static sidebar.
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 768px)") : null;
    const onWide = () => { if (mq?.matches) { leaving.current = true; setOpen(false); } };
    mq?.addEventListener?.("change", onWide);
    return () => mq?.removeEventListener?.("change", onWide);
  }, [open]);

  /** Workspace tile, search, nav and footer; `drawer` adds the close button and leaves out the rail toggle. */
  const parts = (drawer: boolean) => (
    <>
      {/* Workspace tile: app name and the person's workspace. Not a switcher (each person belongs to one workspace), so no
          chevron: a chevron here would promise a menu that does not exist. */}
      <div className="flex-none px-3 pt-3">
        <div className="sb-item sb-frame flex items-center gap-2.5 p-1.5">
          <LogoMark size={32} />
          <div className="sb-label min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">Clowork</p>
            <p className="min-h-4 truncate text-xs text-sidebar-foreground-secondary">{workspace}</p>
          </div>
          {drawer ? (
            <SheetClose asChild>
              <Button ref={closeButton} variant="ghost" size="icon" aria-label="Close navigation"
                className="text-sidebar-foreground-secondary hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-sidebar-ring">
                <X aria-hidden="true" />
              </Button>
            </SheetClose>
          ) : null}
        </div>
      </div>

      {/* Search is shown for the reference layout only: it is disabled until search exists. */}
      <div className="sb-expanded-only flex-none px-3 pt-3">
        <label className="relative block">
          <span className="sr-only">Search (coming soon)</span>
          <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-sidebar-foreground-secondary" />
          <input type="search" disabled placeholder="Search" title="Search: coming soon"
            className="h-9 w-full rounded-full border-0 bg-muted pr-9 pl-8 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70" />
          <kbd aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md bg-card px-1.5 text-xs text-muted-foreground">/</kbd>
        </label>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-3">{nav}</div>

      {drawer ? null : (
        <div className="flex-none px-3 pb-2">
          <button type="button" onClick={() => setSidebarCollapsed(!collapsed)} aria-expanded={!collapsed} aria-controls={SIDEBAR_ID}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={sidebarRowClass}>
            {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            <span aria-hidden="true" className="sb-label">Collapse</span>
          </button>
        </div>
      )}

      {footer ? <div className="flex-none space-y-2 border-t border-sidebar-border p-3">{footer}</div> : null}
    </>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => { leaving.current = false; setOpen(o); }}>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
        {/* Mobile top bar */}
        <header inert={open} className="sticky top-0 z-30 flex h-14 flex-none items-center gap-2 bg-sidebar px-2 text-sidebar-foreground md:hidden">
          <SheetTrigger asChild>
            <Button ref={menuButton} variant="ghost" size="icon" aria-controls={DRAWER_ID} aria-label="Open navigation"
              className="size-10 text-inherit hover:bg-sidebar-hover hover:text-inherit focus-visible:outline-sidebar-ring [&_svg]:size-5">
              <Menu aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <LogoMark size={24} />
          <span className="text-[15px] font-semibold">Clowork</span>
        </header>

        {/* Mobile drawer. Following a link in it closes it (no usePathname here: it would make every route dynamic). */}
        <SheetContent id={DRAWER_ID} side="left" showClose={false} aria-describedby={undefined}
          onOpenAutoFocus={(e) => { e.preventDefault(); closeButton.current?.focus(); }}
          onCloseAutoFocus={(e) => { e.preventDefault(); if (!leaving.current) menuButton.current?.focus(); leaving.current = false; }}
          onClick={(e) => { if ((e.target as HTMLElement).closest("a[href]")) { leaving.current = true; setOpen(false); } }}
          className="w-[280px] max-w-[85vw] overflow-y-hidden border-sidebar-border bg-sidebar text-sidebar-foreground sm:w-[280px] sm:max-w-[85vw] md:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {parts(true)}
        </SheetContent>

        {/* Desktop sidebar (from 768px). Below that it is display:none and the drawer above takes its parts. */}
        <aside id={SIDEBAR_ID} aria-label="Sidebar"
          className="app-sidebar sticky top-0 hidden h-dvh flex-none flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out md:flex">
          {open ? null : parts(false)}
        </aside>

        <main id="main" tabIndex={-1} inert={open} className="min-w-0 flex-1 px-4 py-4 outline-none md:px-6 md:py-6">
          <div className="app-content relative mx-auto w-full max-w-[1440px]">
            {profile ? <div data-profile-slot="" className="absolute top-0 right-0 z-10">{profile}</div> : null}
            {/* Sidebar navigations (transition type "nav") crossfade the page; drags, refreshes and filters never animate. */}
            <ViewTransition update={{ nav: "page", default: "none" }} default="none">
              <div>{children}</div>
            </ViewTransition>
          </div>
        </main>
      </div>
    </Sheet>
  );
}
