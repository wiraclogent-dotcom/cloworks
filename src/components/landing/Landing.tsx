import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BellRing, CalendarDays, CirclePlay, FolderKanban, LayoutGrid, MessageSquareText, Table2 } from "lucide-react";
import { Card } from "@/components/shadcn/card";
import { LogoMark } from "@/components/ui/LogoMark";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/shadcn/badge";
import { NeedsMotionChip } from "@/components/ui/NeedsMotionChip";
import { cn } from "@/components/ui/cn";
import { HeroBoard } from "./HeroBoard";
import { HowItWorks } from "./HowItWorks";

const display = "font-display tracking-[-0.02em]";
const signInLight =
  "inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-[15px] font-semibold text-heading " +
  "transition-colors hover:bg-brand-aqua-tint focus-visible:outline-white";
/** Primary blue pill (both themes); the page's main call to action. */
const ctaPrimary =
  "inline-flex items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground " +
  "transition-colors hover:bg-primary-hover";

/** Sections the top bar links to. */
const NAV = [
  { href: "#showcase", label: "Showcase" },
  { href: "#how", label: "How it works" },
  { href: "#teams", label: "For teams" },
  { href: "#features", label: "Features" },
];



const TOOLS: { icon: ReactNode; title: string; body: string; tone: string }[] = [
  { icon: <LayoutGrid />, title: "Board", tone: "in-progress", body: "Drag cards between columns, on desktop or by touch. Keyboard works too." },
  { icon: <Table2 />, title: "Table", tone: "tag-clogent", body: "Filter by status, brand, division, assignee or motion, then sort by deadline." },
  { icon: <CalendarDays />, title: "Calendar", tone: "due-soon", body: "Deadlines by day, so a busy week is visible before it arrives." },
  { icon: <FolderKanban />, title: "Projects", tone: "first-look", body: "Group requests for a campaign and follow them on a timeline." },
  { icon: <MessageSquareText />, title: "Comments and links", tone: "done", body: "Feedback, @mentions and file links live on the request itself." },
  { icon: <BellRing />, title: "Email updates", tone: "needs-motion", body: "Get an email when you're assigned, mentioned, or your request moves." },
];

/** Example deliverables for the "From brief to feed" strip (generated sample images in public/landing). */
const FEED: { src: string; alt: string; format: string; title: string; motion?: boolean }[] = [
  { src: "/landing/laundry.jpg", alt: "Folded aqua and white towels with soap bubbles", format: "Carousel", title: "Fresh towels, 5 slides" },
  { src: "/landing/reel.jpg", alt: "A woman filming a product on a gimbal next to a ring light", format: "Reel", title: "Behind the scenes", motion: true },
  { src: "/landing/desk.jpg", alt: "A designer's desk with a drawing tablet, colour swatches and coffee", format: "Story", title: "How we design" },
  { src: "/landing/product.jpg", alt: "A white detergent bottle in a water splash on a pale blue background", format: "Banner", title: "Detergent launch" },
  { src: "/landing/team.jpg", alt: "Four colleagues laughing around a laptop in a bright office", format: "Post", title: "We're hiring" },
  { src: "/landing/ramadan.jpg", alt: "Friends sharing dates by lantern light at dusk", format: "Promo", title: "Ramadan offer" },
];

/* ---------- small product fragments for the "for each role" rows (decorative copies of real screens) ---------- */

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BRIEFERS: { name: string; days: boolean[] }[] = [
  { name: "Nadia", days: [true, true, false, true, true, true] },
  { name: "Putri", days: [true, true, true, true, false, true] },
  { name: "Bayu", days: [true, false, true, true, true, true] },
];

function BriefWeek() {
  return (
    <Card asChild className="p-5"><figure>
      <figcaption className="mb-4 text-compact font-semibold text-foreground">Brief calendar, this week</figcaption>
      <table className="w-full border-separate border-spacing-y-2 text-compact">
        <thead>
          <tr>
            <th scope="col" className="sr-only">Person</th>
            {WEEK.map((d) => <th key={d} scope="col" className="w-10 text-center text-xs font-medium text-muted-foreground">{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {BRIEFERS.map((p) => (
            <tr key={p.name}>
              <th scope="row" className="text-left font-medium text-foreground">
                <span className="inline-flex items-center gap-2"><Avatar name={p.name} size="sm" decorative />{p.name}</span>
              </th>
              {p.days.map((sent, i) => (
                <td key={i} className="text-center">
                  <span data-tone={sent ? "done" : "overdue"} title={sent ? "Brief sent" : "No brief"}
                    className={cn("inline-block size-3 rounded-full border-2 border-tone-accent", sent && "bg-tone-accent")}>
                    <span className="sr-only">{sent ? "Brief sent" : "No brief"}</span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure></Card>
  );
}

const QUEUE: { title: string; due: string; tone: "due-soon" | "overdue" | "tag-neutral"; motion?: boolean }[] = [
  { title: "Product launch reel", due: "Due tomorrow", tone: "due-soon", motion: true },
  { title: "Payday promo, feed and story", due: "1 day late", tone: "overdue" },
  { title: "Weekly tips carousel", due: "Due Friday", tone: "tag-neutral" },
];

function DesignerQueue() {
  return (
    <Card asChild className="p-5"><figure>
      <figcaption className="mb-3 text-compact font-semibold text-foreground">Assigned to you</figcaption>
      <ul className="divide-y divide-border">
        {QUEUE.map((q) => (
          <li key={q.title} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
            <span className="min-w-0 basis-full text-sm font-medium text-foreground sm:basis-auto sm:flex-1">{q.title}</span>
            {q.motion ? <NeedsMotionChip /> : null}
            <Badge tone={q.tone}>{q.due}</Badge>
          </li>
        ))}
      </ul>
    </figure></Card>
  );
}

const TEAM: { name: string; done: number }[] = [
  { name: "Raka", done: 22 },
  { name: "Sari", done: 17 },
  { name: "Dimas", done: 11 },
];
const TARGET = 20;

function TeamKpi() {
  return (
    <Card asChild className="p-5"><figure>
      <figcaption className="mb-4 flex items-baseline justify-between text-compact">
        <span className="font-semibold text-foreground">Team KPI, October</span>
        <span className="text-muted-foreground">Target {TARGET} each</span>
      </figcaption>
      <ul className="space-y-4">
        {TEAM.map((m) => {
          const pct = Math.round((m.done / TARGET) * 100);
          const fill = pct >= 100 ? "bg-progress-complete" : pct >= 70 ? "bg-progress-mid" : "bg-progress-low";
          return (
            <li key={m.name}>
              <div className="mb-1.5 flex items-center justify-between text-compact">
                <span className="inline-flex items-center gap-2 font-medium text-foreground"><Avatar name={m.name} size="sm" decorative />{m.name}</span>
                <span className="text-muted-foreground tabular-nums">{m.done} of {TARGET} done</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted outline outline-1 -outline-offset-1 outline-border">
                <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </figure></Card>
  );
}

const ROLES: { who: string; title: string; body: string; points: string[]; visual: ReactNode }[] = [
  {
    who: "Social media",
    title: "Brief once. Know where it is.",
    body: "Send a request in a minute and follow it to done. No more asking in the group chat whether the post is ready.",
    points: ["See every request you sent and its status", "Review on First look and leave feedback in one place", "The brief calendar shows which days you've sent briefs"],
    visual: <BriefWeek />,
  },
  {
    who: "Designers",
    title: "One queue, sorted by deadline.",
    body: "Everything assigned to you is in one list, with the brief, the brand and the deadline on the card.",
    points: ["Due-soon and late work is marked before it slips", "Motion jobs are flagged so you can plan the time", "Move a card and the requester is told"],
    visual: <DesignerQueue />,
  },
  {
    who: "Leads",
    title: "See the whole team at a glance.",
    body: "Assign new work to whoever has room, and track each person's finished work against their monthly target.",
    points: ["Team KPI by month, with each person's progress", "A timeline of who is busy before you assign", "Manage people, brands and divisions in Admin"],
    visual: <TeamKpi />,
  },
];

export function Landing() {
  return (
    <div className="flex flex-1 flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-md text-[17px] font-semibold text-heading">
            <LogoMark size={30} />
            Cloworks
          </Link>
          <ul className="mx-auto hidden items-center gap-1 text-sm font-medium whitespace-nowrap text-muted-foreground lg:flex">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="rounded-md px-3 py-2 transition-colors hover:bg-muted hover:text-foreground">{n.label}</a>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap lg:ml-0">
            <Link href="/signin" className="hidden rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted sm:inline-flex">Sign in</Link>
            <Link href="/signin" className={cn(ctaPrimary, "h-9 px-4 text-sm")}>Open Cloworks</Link>
          </div>
        </nav>
      </header>

      <main id="main">
      {/* Hero: V3 blue that fades to white, centred copy, and the app window as the product shot. */}
      <div className="relative isolate overflow-hidden bg-[linear-gradient(180deg,var(--brand-deep-blue)_0%,var(--brand-gradient-via)_30%,var(--brand-aqua)_52%,var(--brand-aqua-tint)_72%,var(--background)_88%)]">
        <section aria-labelledby="hero-title" className="mx-auto max-w-6xl px-4 pt-16 text-center sm:px-6 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-1.5 text-compact font-medium text-white ring-1 ring-white/35 ring-inset">
            Clogent&apos;s creative studio, in one board
          </p>
          <h1 id="hero-title" className={cn(display, "mx-auto mt-6 max-w-3xl text-[2.5rem] leading-[1.05] font-semibold text-white sm:text-6xl lg:text-[4.25rem]")}>
            Every creative request, from brief to done.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
            Cloworks is where Clogent&apos;s social media team sends design and video briefs, and where the creative team
            picks them up, makes them, and hands them back. One board, so nobody has to ask &ldquo;is it done yet?&rdquo;
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signin" className={cn(signInLight, "h-12 px-6 text-[15px]")}>Sign in to Cloworks</Link>
            <a href="#how" className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium text-white ring-1 ring-white/60 ring-inset transition-colors hover:bg-white/10 [&_svg]:size-4">
              <CirclePlay aria-hidden="true" />See how it works
            </a>
          </div>

          <div className="relative mx-auto mt-16 max-w-5xl text-left">
            <HeroBoard />
          </div>
        </section>
      </div>

      {/* What the requests turn into: the work itself, so the page shows creative output and not only the tool. */}
      <section id="showcase" aria-labelledby="feed-title" className="scroll-mt-16 overflow-hidden bg-background">
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-14 sm:px-6 sm:pt-20">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
            <h2 id="feed-title" className={cn(display, "text-3xl leading-tight font-bold text-heading sm:text-[2.75rem]")}>From brief to feed</h2>
            <p className="max-w-md text-base text-muted-foreground">
              Carousels, reels, stories and banners. Each one starts as a request on the board and ends on Done.
            </p>
          </div>
          <ul className="-mx-4 mt-10 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0">
            {FEED.map((post, i) => (
              <li key={post.src} className={cn("reveal w-[62%] shrink-0 snap-start sm:w-[38%] lg:w-auto", i % 2 === 1 && "lg:translate-y-8")}>
                <figure>
                  <div className="lift group relative aspect-[4/5] overflow-hidden rounded-lg bg-muted shadow-card">
                    <Image src={post.src} alt={post.alt} fill sizes="(min-width: 1024px) 180px, (min-width: 640px) 38vw, 62vw" className="object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-105" />
                    <span className="absolute top-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">{post.format}</span>
                  </div>
                  <figcaption className="mt-3">
                    <span className="block text-sm font-medium text-foreground">{post.title}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone="done">Done</Badge>
                      {post.motion ? <NeedsMotionChip /> : null}
                    </span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <HowItWorks />

      {/* One row per role: what each person gets, next to the screen they'd use. */}
      <section id="teams" aria-labelledby="roles-title" className="scroll-mt-16 bg-background">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 id="roles-title" className={cn(display, "max-w-2xl text-3xl leading-tight font-bold text-heading sm:text-[2.75rem]")}>
            Built for the three people on every request
          </h2>
          <div className="mt-14 space-y-20 sm:space-y-24">
            {ROLES.map((role, i) => (
              <article key={role.who} className="reveal grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                <div className={cn(i % 2 === 1 && "lg:order-2")}>
                  <p className="text-sm font-semibold text-link">{role.who}</p>
                  <h3 className={cn(display, "mt-2 text-2xl leading-tight font-bold text-heading sm:text-[2rem]")}>{role.title}</h3>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">{role.body}</p>
                  <ul className="mt-5 max-w-md space-y-2.5 text-sm text-foreground">
                    {role.points.map((p) => (
                      <li key={p} className="flex gap-3">
                        <span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-brand-aqua" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={cn("relative w-full max-w-lg lg:max-w-none", i % 2 === 1 && "lg:order-1")}>
                  {role.visual}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" aria-labelledby="tools-title" className="scroll-mt-16 border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 id="tools-title" className={cn(display, "max-w-2xl text-3xl leading-tight font-bold text-heading sm:text-[2.75rem]")}>
            Look at the work the way you need it
          </h2>
          <dl className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((t) => (
              <div key={t.title} className="reveal lift rounded-xl border border-border bg-background p-5">
                <dt className="flex flex-col gap-3 text-base font-semibold text-heading">
                  <span aria-hidden="true" data-tone={t.tone} className="flex size-11 items-center justify-center rounded-xl bg-tone-tint text-tone-text [&_svg]:size-5">{t.icon}</span>
                  {t.title}
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="cta-title" className="relative isolate overflow-hidden bg-[var(--brand-deep-blue-night)] text-white">
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-full bg-[radial-gradient(50%_80%_at_50%_120%,color-mix(in_srgb,var(--brand-deep-blue)_70%,transparent),transparent)]" />
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="md:order-1">
            <h2 id="cta-title" className={cn(display, "text-3xl leading-tight font-bold sm:text-[2.75rem]")}>Got something to brief?</h2>
            <p className="mt-3 text-base text-white/80">Sign in with your Clogent account. New here? Ask your workspace lead for a join link.</p>
          </div>
          <Link href="/signin" className={cn(signInLight, "press shrink-0 whitespace-nowrap md:order-3")}>Sign in to Cloworks</Link>
        </div>
      </section>
      </main>

      <footer className="border-t border-white/10 bg-[var(--brand-deep-blue-night)] text-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-compact sm:px-6">
          <span className="inline-flex items-center gap-2"><LogoMark size={20} />Cloworks, the Clogent creative team&apos;s request tracker</span>
          <span>Clogent</span>
        </div>
      </footer>
    </div>
  );
}
