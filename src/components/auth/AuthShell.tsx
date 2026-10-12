import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { BrandArt } from "@/components/ui/BrandArt";
import { LogoMark } from "@/components/ui/LogoMark";
import { cn } from "@/components/ui/cn";

/** Same display face as the landing page (loaded in the root layout), so the account pages read as one site. */
export const display = "font-display tracking-[-0.02em]";

/** Big page heading in the display face. */
export const authTitleClass = cn(display, "text-[2.25rem] leading-[1.1] font-bold text-heading sm:text-[2.6rem]");

/**
 * Layout for the public account pages (/signin, /signup, /verify, /join/*, /lobby): the form side with the landing
 * hero's wash, and on wide screens the Deep Blue panel with the clay studio floating in it. `title` is the page's h1;
 * pass `title={null}` when the content renders its own (e.g. a heading that depends on request data).
 */
export function AuthShell({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
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
          <div className="animate-rise mx-auto w-full max-w-[400px]">
            {title !== null && <h1 className={authTitleClass}>{title}</h1>}
            {intro && <p className="mt-3 text-base leading-relaxed text-foreground-secondary">{intro}</p>}
            <div className={cn(title !== null && "mt-8")}>{children}</div>
          </div>
        </main>
      </div>

      {/* Brand panel (wide screens): Deep Blue with an Aqua edge and the clay studio. Art is lazy, so phones (panel hidden) never fetch it. */}
      <aside data-brand-panel="" aria-label="About Cloworks" className="relative isolate hidden overflow-hidden border-l-4 border-brand-aqua bg-brand-deep-blue text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_80%_0%,color-mix(in_srgb,var(--brand-aqua)_35%,transparent),transparent_70%)]" />
        <div aria-hidden="true" className="animate-mesh absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_30%_40%,color-mix(in_srgb,var(--brand-aqua)_28%,transparent),transparent),radial-gradient(35%_35%_at_80%_70%,color-mix(in_srgb,var(--brand-gradient-via)_35%,transparent),transparent)] bg-no-repeat" />
        <div aria-hidden="true" className="relative flex min-h-0 flex-1 items-center justify-center px-10 pt-10 xl:px-14">
          <BrandArt name="auth" width={420} sizes="(min-width: 1280px) 420px, 34vw" className="animate-float relative max-h-[62dvh] w-auto object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.35)]" />
          <BrandArt name="step-brief" width={120} style={{ "--float-delay": "-2s" } as CSSProperties} className="animate-float absolute top-[12%] left-[10%] size-24 object-contain xl:size-28" />
          <BrandArt name="celebrate" width={110} style={{ "--float-delay": "-4s" } as CSSProperties} className="animate-float absolute right-[10%] bottom-[14%] size-20 object-contain xl:size-24" />
        </div>
        <div className="relative px-10 pt-6 pb-12 xl:px-14">
          <p className={cn(display, "max-w-md text-[1.75rem] leading-tight font-bold")}>Every creative request, from brief to done.</p>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/75">
            Carousels, reels, stories and banners for Clogent&apos;s brands. Each one started as a request here.
          </p>
        </div>
      </aside>
    </div>
  );
}
