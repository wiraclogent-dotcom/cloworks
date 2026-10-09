"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronsUpDown, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { RAIL_DEFAULT_QUERY, setSidebarCollapsed, sidebarIsCollapsed } from "@/lib/theme";
import { cn } from "@/components/ui/cn";
import { LogoMark } from "@/components/ui/LogoMark";
import { sidebarRowClass } from "./classes";

const SIDEBAR_ID = "app-sidebar";

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
 * Client frame of the signed-in app: Deep Blue sidebar (232px, collapsible to a 64px rail on desktop, remembered in
 * localStorage `ct-sidebar`), slim top bar + off-canvas drawer below 768px, skip link and `<main id="main">`.
 * The server AppShell passes in the nav and footer (permission checks stay on the server).
 */
export function AppFrame({ nav, footer, children }: { nav: ReactNode; footer: ReactNode; children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, () => false);
  const [open, setOpen] = useState(false);
  const restoreFocus = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  function close(returnFocus = true) {
    restoreFocus.current = returnFocus;
    setOpen(false);
  }

  useEffect(() => {
    if (open) {
      // The drawer is `visibility: hidden` until this commit and its visibility is transitioned, so focus() can be a
      // no-op in the same tick in a real browser (QA saw focus stay on the hamburger). Try now, then again on the next
      // frame and after the 200ms slide, stopping as soon as focus is inside the drawer.
      const focusIn = () => {
        const el = closeButton.current;
        if (el && !el.closest("aside")?.contains(document.activeElement)) el.focus();
      };
      focusIn();
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(focusIn) : 0;
      const late = window.setTimeout(focusIn, 220);
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { restoreFocus.current = true; setOpen(false); } };
      document.addEventListener("keydown", onKey);
      // Growing past the mobile breakpoint turns the drawer back into the static sidebar.
      const mq = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 768px)") : null;
      const onWide = () => { if (mq?.matches) { restoreFocus.current = false; setOpen(false); } };
      mq?.addEventListener?.("change", onWide);
      return () => {
        if (raf) cancelAnimationFrame(raf);
        window.clearTimeout(late);
        document.removeEventListener("keydown", onKey);
        mq?.removeEventListener?.("change", onWide);
      };
    }
    if (restoreFocus.current) {
      restoreFocus.current = false;
      menuButton.current?.focus();
    }
  }, [open]);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
        {/* Mobile top bar */}
        <header inert={open} className="sticky top-0 z-30 flex h-14 flex-none items-center gap-2 bg-sidebar px-2 text-sidebar-foreground md:hidden">
          <button ref={menuButton} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls={SIDEBAR_ID} aria-label="Open navigation"
            className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-sidebar-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring">
            <Menu aria-hidden="true" className="size-5" />
          </button>
          <LogoMark size={24} />
          <span className="text-[15px] font-semibold">Cloworks</span>
        </header>

        {open ? <div aria-hidden="true" data-testid="sidebar-backdrop" onClick={() => close()} className="fixed inset-0 z-40 bg-[var(--backdrop)] md:hidden" /> : null}

        {/* Following a link from the drawer closes it (no usePathname here: it would make every route dynamic). */}
        <aside id={SIDEBAR_ID} aria-label="Sidebar" data-open={open || undefined}
          onClick={(e) => { if (open && (e.target as HTMLElement).closest("a[href]")) close(false); }}
          className={cn(
            "app-sidebar fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
            "transition-[transform,width,visibility] duration-200 ease-out",
            "md:visible md:sticky md:top-0 md:z-auto md:h-dvh md:max-w-none md:flex-none md:translate-x-0",
            open ? "visible translate-x-0 shadow-raised" : "invisible -translate-x-full",
          )}>
          {/* Workspace switcher (reference): the chevron is decorative until there is more than one workspace. */}
          <div className="flex-none px-3 pt-3">
            <div className="sb-item flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2 shadow-card">
              <LogoMark size={32} />
              <div className="sb-label min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold text-sidebar-foreground">Cloworks</p>
                <p className="truncate text-xs text-sidebar-foreground-secondary">Creative team</p>
              </div>
              <ChevronsUpDown aria-hidden="true" className="sb-label size-4 shrink-0 text-sidebar-foreground-secondary" />
              <button ref={closeButton} type="button" onClick={() => close()} aria-label="Close navigation"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground-secondary hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring md:hidden">
                <X aria-hidden="true" className="size-[18px]" />
              </button>
            </div>
          </div>

          {/* Search is shown for the reference layout only: it is disabled until search exists. */}
          <div className="sb-expanded-only flex-none px-3 pt-3">
            <label className="relative block">
              <span className="sr-only">Search (coming soon)</span>
              <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-sidebar-foreground-secondary" />
              <input type="search" disabled placeholder="Search" title="Search: coming soon"
                className="h-9 w-full rounded-lg border border-border bg-surface pr-9 pl-8 text-sm text-foreground placeholder:text-foreground-secondary disabled:cursor-not-allowed disabled:opacity-70" />
              <kbd aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border px-1.5 text-[11px] text-foreground-secondary">/</kbd>
            </label>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-3">{nav}</div>

          <div className="hidden flex-none px-3 pb-2 md:block">
            <button type="button" onClick={() => setSidebarCollapsed(!collapsed)} aria-expanded={!collapsed} aria-controls={SIDEBAR_ID}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={sidebarRowClass}>
              {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
              <span aria-hidden="true" className="sb-label">Collapse</span>
            </button>
          </div>

          <div className="flex-none space-y-2 border-t border-sidebar-border p-3">{footer}</div>
        </aside>

        <main id="main" tabIndex={-1} inert={open} className="min-w-0 flex-1 px-4 py-4 outline-none md:px-6 md:py-6">
          <div className="app-content mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </>
  );
}

