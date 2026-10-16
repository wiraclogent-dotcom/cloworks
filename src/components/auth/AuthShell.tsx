import type { ReactNode } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/ui/LogoMark";
import { cn } from "@/components/ui/cn";
import { BrandPanel } from "./BrandPanel";

/** Same display face as the landing page (loaded in the root layout), so the account pages read as one site. */
export const display = "font-display tracking-[-0.02em]";

/** Big page heading in the display face. */
export const authTitleClass = cn(display, "text-[2.25rem] leading-[1.1] font-bold text-heading sm:text-[2.6rem]");

/**
 * Layout for the public account pages (/signin, /signup, /verify, /join/*, /lobby): the form side with the landing
 * calm canvas, and on wide screens the blue V3 panel (`BrandPanel`). `title` is the page's h1;
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
            Clowork
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

      <BrandPanel display={display} />
    </div>
  );
}
