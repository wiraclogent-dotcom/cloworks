import { BatteryFull, Bell, Link2, Menu, MessageSquare, Plus, Signal, Wifi } from "lucide-react";
import { Card } from "@/components/shadcn/card";
import { Progress } from "@/components/shadcn/progress";
import { Avatar } from "@/components/ui/Avatar";
import { BrandTag } from "@/components/ui/BrandTag";
import { DeadlineChip } from "@/components/ui/DeadlineChip";
import { LogoMark } from "@/components/ui/LogoMark";
import { NeedsMotionChip } from "@/components/ui/NeedsMotionChip";
import { cn } from "@/components/ui/cn";

type Sample = { code: string; title: string; brand: string; daysLeft: number; from: string; to: string; motion?: boolean; comment?: string };

const CARDS: Sample[] = [
  { code: "REQ-A04D", title: "Product launch reel", brand: "Clogent", daysLeft: 0, from: "Nadia", to: "Raka", motion: true, comment: "Can the logo hold a beat longer?" },
  { code: "REQ-A04C", title: "Ramadan promo carousel", brand: "Bubble Wash", daysLeft: 2, from: "Dimas", to: "Sari" },
  { code: "REQ-A04B", title: "Weekly story set", brand: "Clogent", daysLeft: 5, from: "Sari", to: "Dimas" },
];

/** One board card as the phone shows it: code, title, chips, the latest comment, then requester and assignee. */
function PhoneCard({ card }: { card: Sample }) {
  return (
    <Card className="p-3 text-xs">
      <p className="flex items-center gap-1.5 text-muted-foreground"><Link2 strokeWidth={1.75} className="size-3.5" /><span className="font-medium tabular-nums">{card.code}</span></p>
      <p className="mt-1.5 text-sm font-semibold">{card.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <BrandTag name={card.brand} />
        <DeadlineChip daysLeft={card.daysLeft} />
        {card.motion && <NeedsMotionChip />}
      </div>
      {card.comment && (
        <p className="mt-2.5 flex gap-1.5 rounded-lg rounded-tl-sm bg-muted px-2.5 py-2">
          <MessageSquare strokeWidth={1.75} className="mt-px size-3.5 shrink-0 text-muted-foreground" />
          <span><span className="font-semibold">{card.from}</span> {card.comment}</span>
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2.5 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Avatar name={card.from} size="sm" decorative />{card.from}</span>
        <span className="inline-flex items-center gap-1.5">{card.to}<Avatar name={card.to} size="sm" decorative /></span>
      </div>
    </Card>
  );
}

/**
 * Product panel for the account pages (wide screens): the V3 blue with the pitch on top and the app as it looks on a
 * phone below. The phone keeps its size and the panel's bottom edge crops it on shorter screens. Decorative.
 */
export function BrandPanel({ display }: { display: string }) {
  return (
    <aside data-brand-panel="" aria-label="About Clowork" className="relative isolate hidden overflow-hidden text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:p-4">
      <div className="relative isolate flex flex-1 flex-col overflow-hidden rounded-[28px] bg-[linear-gradient(165deg,var(--brand-deep-blue)_0%,var(--brand-gradient-via)_60%,var(--brand-aqua)_100%)] px-10 pt-14 xl:px-14">
        {/* Texture: a faint dot grid that fades out downwards, and a soft light behind the phone. */}
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.16)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
        <div aria-hidden="true" className="absolute -bottom-40 left-1/2 -z-10 size-[520px] -translate-x-1/2 rounded-full bg-white/20 blur-3xl" />

        <div className="text-center">
          <p className="mx-auto inline-flex w-fit items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-medium ring-1 ring-white/35 ring-inset">Creative ops for Clogent</p>
          <p className={cn(display, "mx-auto mt-6 max-w-md text-[2.5rem] leading-[1.06] font-semibold")}>Every creative request, from brief to done.</p>
          <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-white/85">
            Carousels, reels, stories and banners for Clogent&apos;s brands. Each one started as a request here.
          </p>
        </div>

        <div aria-hidden="true" className="relative mt-10 min-h-0 flex-1">
          <div className="absolute top-0 left-1/2 w-[340px] -translate-x-1/2 rounded-[52px] bg-[#0b1020] p-2.5 shadow-[0_30px_60px_-20px_rgb(10_26_79/0.55)] ring-1 ring-white/20">
            <div className="relative h-[700px] overflow-hidden rounded-[42px] bg-background text-foreground">
              {/* Status bar and the dynamic island */}
              <div className="flex h-11 items-center justify-between px-7 text-xs font-semibold">
                <span className="tabular-nums">9:41</span>
                <span className="absolute top-2.5 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-[#0b1020]" />
                <span className="flex items-center gap-1 [&_svg]:size-3.5"><Signal /><Wifi /><BatteryFull /></span>
              </div>

              {/* The app's mobile top bar (AppFrame) */}
              <div className="flex h-12 items-center gap-2 bg-sidebar px-3 text-sidebar-foreground">
                <Menu className="size-5" />
                <LogoMark size={22} />
                <span className="text-sm font-semibold">Clowork</span>
                <Bell className="ml-auto size-[18px]" />
              </div>

              <div className="space-y-3 px-3.5 pt-4">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xl font-bold text-heading">Requests</p>
                    <p className="text-xs text-muted-foreground">13 open, 3 due today</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"><Plus className="size-3.5" />New</span>
                </div>

                <div className="grid grid-cols-3 rounded-full bg-muted p-0.5 text-center text-xs">
                  {["Board", "Table", "Calendar"].map((tab) => (
                    <span key={tab} className={cn("rounded-full py-1", tab === "Board" ? "bg-card font-medium shadow-card" : "text-muted-foreground")}>{tab}</span>
                  ))}
                </div>

                <Card className="border-primary bg-primary p-3 text-xs text-primary-foreground">
                  <p className="flex items-baseline justify-between"><span className="opacity-90">October target</span><span className="text-base font-semibold tabular-nums">18 / 20</span></p>
                  <Progress value={90} className="mt-2 h-1.5 bg-white/25 outline-none" indicatorClassName="bg-white" />
                </Card>

                <p data-tone="first-look" className="flex items-center gap-1.5 border-b-2 border-tone-accent pb-1.5 text-xs font-semibold">
                  <span className="size-2 rounded-full bg-tone-accent" />First look<span className="ml-auto font-medium text-muted-foreground tabular-nums">3</span>
                </p>
                {CARDS.map((card) => <PhoneCard key={card.code} card={card} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
