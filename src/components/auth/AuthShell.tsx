import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/shadcn/card";
import { LogoMark } from "@/components/ui/LogoMark";
import { cn } from "@/components/ui/cn";

/** Same display face as the landing page (loaded in the root layout), so the account pages read as one site. */
export const display = "font-display tracking-[-0.02em]";

/** Big page heading in the display face. */
export const authTitleClass = cn(display, "text-[2.25rem] leading-[1.1] font-bold text-heading sm:text-[2.6rem]");

/**
 * Layout for the public account pages (/signin, /signup, /verify, /join/*, /lobby): the form side with the landing
 * calm canvas, and on wide screens the blue V3 panel with a few flat product cards. `title` is the page's h1;
 * pass `title={null}` when the content renders its own (e.g. a heading that depends on request data).
 */
export function AuthShell({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Form side: plain card surface. */}
      <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-card">

        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-md text-[17px] font-semibold text-heading">
            <LogoMark size={30} />
            Cloworks
          </Link>
          <Link href="/" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            Back to home
          </Link>
        </header>

        <main id="main" className="flex flex-1 items-center px-4 pt-6 pb-16 sm:px-8">
          <div className="mx-auto w-full max-w-[400px]">
            {title !== null && <h1 className={authTitleClass}>{title}</h1>}
            {intro && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{intro}</p>}
            <div className={cn(title !== null && "mt-8")}>{children}</div>
          </div>
        </main>
      </div>

      {/* Product panel (wide screens): the V3 blue that fades to a pale sky, with a few flat product cards. Decorative. */}
      <aside data-brand-panel="" aria-label="About Cloworks" className="relative isolate hidden overflow-hidden text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:p-4">
        <div className="relative isolate flex flex-1 flex-col overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,var(--brand-deep-blue)_0%,var(--brand-gradient-via)_42%,var(--brand-aqua)_68%,var(--brand-aqua-tint)_100%)] px-10 pt-14 xl:px-14">
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-medium ring-1 ring-white/35 ring-inset">Creative ops for Clogent</p>
          <p className={cn(display, "mt-6 max-w-md text-[2.5rem] leading-[1.06] font-semibold")}>Every creative request, from brief to done.</p>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">
            Carousels, reels, stories and banners for Clogent&apos;s brands. Each one started as a request here.
          </p>
          <div aria-hidden="true" className="mt-auto grid w-full max-w-md gap-3 self-center pb-12 text-foreground">
            <Card className="p-5">
              <p className="flex items-center justify-between text-compact"><span className="font-semibold">REQ-A04D</span><span data-tone="first-look" className="rounded-full bg-tone-tint px-2.5 py-0.5 font-medium text-tone-text">First look</span></p>
              <p className="mt-2 text-lg font-semibold">Product launch reel</p>
              <p className="mt-3 rounded-xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-sm"><span className="font-semibold">Nadia</span> Can the logo hold a beat longer?</p>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-primary bg-primary p-4 text-primary-foreground"><p className="text-compact opacity-90">October target</p><p className="mt-1 text-2xl font-semibold">18 / 20</p></Card>
              <Card className="p-4"><p className="text-compact text-muted-foreground">Open requests</p><p className="mt-1 text-2xl font-semibold">13</p></Card>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
