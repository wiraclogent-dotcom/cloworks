import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bricolage_Grotesque } from "next/font/google";
import { Chip } from "@/components/ui/Chip";
import { LogoMark } from "@/components/ui/LogoMark";
import { cn } from "@/components/ui/cn";

/** Same display face as the landing page, so the sign-in, sign-up and join pages read as one site. */
const displayFont = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700"] });
export const display = "font-[family-name:var(--font-display)] tracking-[-0.02em]";

/** Big page heading in the display face. */
export const authTitleClass = cn(display, "text-[2.25rem] leading-[1.1] font-bold text-heading sm:text-[2.6rem]");

/** Finished work from the landing page's "From brief to feed" strip, shown as two offset columns. */
const WORK: { src: string; alt: string; format: string }[][] = [
  [
    { src: "/landing/laundry.jpg", alt: "Folded aqua and white towels with soap bubbles", format: "Carousel" },
    { src: "/landing/desk.jpg", alt: "A designer's desk with a drawing tablet, colour swatches and coffee", format: "Story" },
    { src: "/landing/team.jpg", alt: "Four colleagues laughing around a laptop in a bright office", format: "Post" },
  ],
  [
    { src: "/landing/reel.jpg", alt: "A woman filming a product on a gimbal next to a ring light", format: "Reel" },
    { src: "/landing/product.jpg", alt: "A white detergent bottle in a water splash on a pale blue background", format: "Banner" },
    { src: "/landing/ramadan.jpg", alt: "Friends sharing dates by lantern light at dusk", format: "Promo" },
  ],
];

/**
 * Layout for the public account pages (/signin, /signup, /verify, /join/*, /lobby): the form side with the landing
 * hero's wash, and on wide screens the Deep Blue panel with work made through Cloworks. `title` is the page's h1;
 * pass `title={null}` when the content renders its own (e.g. a heading that depends on request data).
 */
export function AuthShell({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className={cn(displayFont.variable, "grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]")}>
      {/* Form side: the landing hero's Aqua and Deep Blue wash with its faint grid. */}
      <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(70%_45%_at_20%_0%,color-mix(in_srgb,var(--brand-aqua)_16%,transparent),transparent_70%),radial-gradient(50%_40%_at_90%_15%,color-mix(in_srgb,var(--brand-deep-blue)_12%,transparent),transparent_70%)]" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40 [mask-image:radial-gradient(60%_50%_at_20%_0%,black,transparent)]" />

        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-md text-[17px] font-semibold text-heading">
            <LogoMark size={30} />
            Cloworks
          </Link>
          <Link href="/" className="rounded-md px-3 py-2 text-sm font-medium text-foreground-secondary hover:bg-surface-muted hover:text-foreground">
            Back to home
          </Link>
        </header>

        <main id="main" className="flex flex-1 items-center px-4 pt-6 pb-16 sm:px-8">
          <div className="mx-auto w-full max-w-[400px]">
            {title !== null && <h1 className={authTitleClass}>{title}</h1>}
            {intro && <p className="mt-3 text-base leading-relaxed text-foreground-secondary">{intro}</p>}
            <div className={cn(title !== null && "mt-8")}>{children}</div>
          </div>
        </main>
      </div>

      {/* Brand panel (wide screens): Deep Blue with an Aqua edge, and the work that came through Cloworks. */}
      <aside data-brand-panel="" aria-label="Work made with Cloworks" className="relative isolate hidden overflow-hidden border-l-4 border-brand-aqua bg-brand-deep-blue text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_80%_0%,color-mix(in_srgb,var(--brand-aqua)_35%,transparent),transparent_70%)]" />
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-hidden px-10 pt-10 xl:px-14">
          {WORK.map((col, c) => (
            <ul key={c} className={cn("space-y-4", c === 1 && "-mt-24")}>
              {col.map((w) => (
                <li key={w.src} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-white/10 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.45)]">
                  <Image src={w.src} alt={w.alt} fill sizes="(min-width: 1280px) 22vw, 25vw" className="object-cover" />
                  <span className="absolute top-2.5 left-2.5 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">{w.format}</span>
                  <span className="absolute right-2.5 bottom-2.5"><Chip tone="done">Done</Chip></span>
                </li>
              ))}
            </ul>
          ))}
        </div>
        {/* Fade the photo wall into the caption. */}
        <div className="relative -mt-56 bg-gradient-to-b from-transparent via-[var(--brand-deep-blue-night)]/95 via-45% to-[var(--brand-deep-blue-night)] px-10 pt-36 pb-12 xl:px-14">
          <p className={cn(display, "max-w-md text-[1.75rem] leading-tight font-bold")}>Every creative request, from brief to done.</p>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/75">
            Carousels, reels, stories and banners for Clogent&apos;s brands. Each one started as a request here.
          </p>
        </div>
      </aside>
    </div>
  );
}
