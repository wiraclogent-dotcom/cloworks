import type { ReactNode } from "react";
import type { RequestStatus } from "@prisma/client";
import { CalendarCheck, ChartColumn, FolderKanban, LayoutGrid, Plus, Search, SlidersHorizontal, Users } from "lucide-react";
import { BOARD_STATUSES, STATUS_LABEL } from "@/components/status";
import { REQUEST_STATUS_TONE } from "@/lib/palette";
import { Avatar } from "@/components/ui/Avatar";
import { BrandTag } from "@/components/ui/Chip";
import { NeedsMotionChip } from "@/components/ui/NeedsMotionChip";
import { cn } from "@/components/ui/cn";
import { LogoMark } from "@/components/ui/LogoMark";

type Sample = { title: string; brand: string; who: string; motion?: boolean };

/** Sample cards that stay put; the travelling card moves across them. */
const STILL: Record<RequestStatus, Sample[]> = {
  REQUESTED: [{ title: "Ramadan promo carousel", brand: "Bubble Wash", who: "Nadia" }],
  ON_PROGRESS: [{ title: "Product launch reel", brand: "Clogent", who: "Raka", motion: true }],
  FIRST_LOOK: [{ title: "Weekly story set", brand: "Clogent", who: "Dimas" }],
  DONE: [
    { title: "Hiring post for designers", brand: "Clogent", who: "Sari" },
    { title: "Promo banner, 3 sizes", brand: "Bubble Wash", who: "Raka" },
  ],
  CANCELLED: [],
};

function StillCard({ card }: { card: Sample }) {
  return (
    <div className="rounded-md border border-border bg-surface p-2 shadow-card sm:p-2.5">
      <p className="line-clamp-2 text-[11px] leading-4 font-medium text-foreground sm:text-xs">{card.title}</p>
      <div className="mt-2 flex items-center justify-between gap-1">
        {card.motion ? <NeedsMotionChip className="hidden lg:inline-flex" /> : <BrandTag name={card.brand} className="hidden lg:inline-flex" />}
        <Avatar name={card.who} size="sm" decorative className="ml-auto" />
      </div>
    </div>
  );
}

/** The four board columns with one request card travelling across them (animation in globals.css). */
function MiniBoard() {
  return (
      <div className="landing-board grid grid-cols-4 gap-[var(--gap)]">
        {BOARD_STATUSES.map((status) => (
          <div key={status} className="min-w-0">
            <div data-tone={REQUEST_STATUS_TONE[status]} className="mb-2 flex h-7 items-center gap-1.5 border-b-2 border-tone-accent px-0.5">
              <span className="size-2 shrink-0 rounded-full bg-tone-accent" />
              <span className="truncate text-[11px] font-semibold text-foreground sm:text-xs">{STATUS_LABEL[status]}</span>
            </div>
            <div className="landing-slot rounded-md border border-dashed border-border-strong/70" />
            <div className="mt-2 space-y-2">
              {STILL[status].map((card) => <StillCard key={card.title} card={card} />)}
            </div>
          </div>
        ))}
        <div className="landing-traveller flex flex-col rounded-md bg-surface p-2 shadow-raised sm:p-2.5">
          <p className="line-clamp-2 text-[11px] leading-4 font-semibold text-foreground sm:text-xs">October feed, 9 posts</p>
          <div className="relative mt-auto h-4">
            {BOARD_STATUSES.map((status, i) => (
              <span key={status} data-tone={REQUEST_STATUS_TONE[status]}
                className={cn("landing-state", `landing-s${i}`, "absolute inset-0 flex items-center gap-1 text-[10px] font-medium text-tone-text sm:text-[11px]")}>
                <span className="size-1.5 shrink-0 rounded-full bg-tone-accent" />
                <span className="truncate">{STATUS_LABEL[status]}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
  );
}

const SIDEBAR: { icon: ReactNode; label: string; active?: boolean }[] = [
  { icon: <LayoutGrid />, label: "Requests", active: true },
  { icon: <FolderKanban />, label: "Projects" },
  { icon: <CalendarCheck />, label: "Brief Calendar" },
  { icon: <ChartColumn />, label: "My KPI" },
  { icon: <Users />, label: "Team KPI" },
];

/**
 * Decorative app window for the landing hero: browser bar, the app's sidebar and toolbar, and the live mini board.
 * Hidden from assistive tech: the hero copy and the "How a request moves" steps say the same thing in words.
 */
export function HeroBoard() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_64px_-12px_color-mix(in_srgb,var(--brand-deep-blue)_28%,transparent)]">
      {/* Browser bar */}
      <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto hidden w-full max-w-xs items-center justify-center rounded-md bg-surface px-3 py-1 text-[11px] text-foreground-secondary sm:flex">
          cloworks.vercel.app/requests
        </span>
        <span className="w-[42px]" />
      </div>

      <div className="flex">
        {/* App sidebar */}
        <div className="hidden w-48 shrink-0 flex-col gap-1 border-r border-border bg-sidebar p-3 md:flex">
          <span className="mb-3 flex items-center gap-2 px-1.5 text-[13px] font-semibold text-foreground"><LogoMark size={22} />Cloworks</span>
          <span className="mb-2 flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] text-foreground-secondary [&_svg]:size-3.5">
            <Search />Search
          </span>
          {SIDEBAR.map((item) => (
            <span key={item.label}
              className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-xs [&_svg]:size-3.5",
                item.active ? "bg-sidebar-active font-medium text-foreground shadow-card" : "text-foreground-secondary")}>
              {item.icon}{item.label}
            </span>
          ))}
        </div>

        {/* Page */}
        <div className="min-w-0 flex-1 p-3 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-foreground sm:text-lg">Requests</p>
              <p className="hidden text-[11px] text-foreground-secondary sm:block">12 open, 3 due today</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground [&_svg]:size-3.5">
              <Plus />New request
            </span>
          </div>
          <div className="mb-3 flex items-center gap-1 text-[11px]">
            {["Board", "Table", "Calendar", "Timeline"].map((tab, i) => (
              <span key={tab} className={cn("rounded-md px-2 py-1", i === 0 ? "bg-surface font-medium text-foreground shadow-card ring-1 ring-border" : "text-foreground-secondary")}>{tab}</span>
            ))}
            <span className="ml-auto hidden items-center gap-1 text-foreground-secondary sm:inline-flex [&_svg]:size-3.5"><SlidersHorizontal />Filters</span>
          </div>
          <div className="rounded-xl bg-[var(--board-canvas)] p-2.5 sm:p-3">
            <MiniBoard />
          </div>
        </div>
      </div>
    </div>
  );
}
