import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Bricolage_Grotesque } from "next/font/google";
import { Suspense, use } from "react";
import { signIn } from "@/lib/auth";
import { oauthProviderIds } from "@/lib/auth.config";
import { PASSWORD_CHANGED_MESSAGE, signInErrorMessage } from "@/lib/signinError";
import { fieldClass, labelClass } from "@/components/ui/Field";
import { passwordSignIn } from "./actions";
import { Alert } from "@/components/ui/Alert";
import { Chip } from "@/components/ui/Chip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LogoMark } from "@/components/ui/LogoMark";
import { cn } from "@/components/ui/cn";

/** Same display face as the landing page, so the two read as one site. */
const displayFont = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700"] });
const display = "font-[family-name:var(--font-display)] tracking-[-0.02em]";

/** Tab title: "Sign in · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Sign in" };

type SP = Promise<{ error?: string | string[]; changed?: string | string[] }>;

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

/** Reads the request's query (dynamic), so it sits in its own Suspense boundary and the rest of the page stays static. */
function Notice({ searchParams }: { searchParams: SP }) {
  const sp = use(searchParams);
  const notice = signInErrorMessage(sp.error);
  if (notice) return <Alert tone="danger">{notice}</Alert>;
  return sp.changed ? <Alert tone="success">{PASSWORD_CHANGED_MESSAGE}</Alert> : null;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-[18px]">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" className="size-4">
      <path fill="#F25022" d="M0 0h10v10H0z" />
      <path fill="#7FBA00" d="M11 0h10v10H11z" />
      <path fill="#00A4EF" d="M0 11h10v10H0z" />
      <path fill="#FFB900" d="M11 11h10v10H11z" />
    </svg>
  );
}

const providerButton = "h-11 gap-2.5 border-border-strong bg-surface text-[15px] font-medium shadow-card hover:bg-surface-muted";

/** Microsoft sign-in is not set up yet (no Entra app registration), so its button stays hidden even if env vars exist. */
const SHOW_MICROSOFT_BUTTON = false;

export default function SignInPage({ searchParams }: { searchParams: SP }) {
  const providers = oauthProviderIds().filter((p) => p !== "microsoft-entra-id" || SHOW_MICROSOFT_BUTTON);
  return (
    <div className={cn(displayFont.variable, "grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]")}>
      {/* Form side: the landing hero's Aqua and Deep Blue wash with its faint grid. */}
      <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(70%_45%_at_20%_0%,rgba(17,170,159,0.16),transparent_70%),radial-gradient(50%_40%_at_90%_15%,rgba(9,66,109,0.12),transparent_70%)]" />
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
            <h1 className={cn(display, "text-[2.25rem] leading-[1.1] font-bold text-heading sm:text-[2.6rem]")}>Sign in</h1>
            <p className="mt-3 text-base leading-relaxed text-foreground-secondary">
              Send briefs, follow them across the board, and pick up the work assigned to you.
            </p>

            <div className="mt-8 space-y-4">
              <Suspense fallback={null}><Notice searchParams={searchParams} /></Suspense>

              {providers.length > 0 && (
                <div className="space-y-3">
                  {providers.includes("google") && (
                    <form
                      action={async () => {
                        "use server";
                        await signIn("google", { redirectTo: "/requests" });
                      }}
                    >
                      <SubmitButton block className={providerButton} pendingLabel="Opening Google…">
                        <GoogleMark />Continue with Google
                      </SubmitButton>
                    </form>
                  )}
                  {providers.includes("microsoft-entra-id") && (
                    <form
                      action={async () => {
                        "use server";
                        await signIn("microsoft-entra-id", { redirectTo: "/requests" });
                      }}
                    >
                      <SubmitButton block className={providerButton} pendingLabel="Opening Microsoft…">
                        <MicrosoftMark />Continue with Microsoft
                      </SubmitButton>
                    </form>
                  )}
                  <div className="flex items-center gap-3 pt-2 text-[13px] text-foreground-secondary">
                    <span aria-hidden="true" className="h-px flex-1 bg-border" />
                    or use your password
                    <span aria-hidden="true" className="h-px flex-1 bg-border" />
                  </div>
                </div>
              )}

              <form action={passwordSignIn} className="space-y-4">
                <div>
                  <label htmlFor="signin-email" className={labelClass}>Email</label>
                  <input id="signin-email" name="email" type="email" autoComplete="username" placeholder="name@clogent.co.id" required className={fieldClass({ className: "h-11" })} />
                </div>
                <div>
                  <label htmlFor="signin-password" className={labelClass}>Password</label>
                  <input id="signin-password" name="password" type="password" autoComplete="current-password" required className={fieldClass({ className: "h-11" })} />
                </div>
                <SubmitButton variant="primary" block className="h-11 bg-brand-deep-blue text-[15px] font-semibold text-white shadow-[0_6px_16px_-4px_rgba(9,66,109,0.45)] hover:bg-[#0b5185]" pendingLabel="Signing in…">
                  Sign in
                </SubmitButton>
              </form>
              <p className="text-sm text-foreground-secondary">No password yet, or forgot it? Ask Wira to set one.</p>
            </div>
          </div>
        </main>
      </div>

      {/* Brand panel (wide screens): Deep Blue with an Aqua edge, and the work that came through Cloworks. */}
      <aside data-brand-panel="" aria-label="Work made with Cloworks" className="relative isolate hidden overflow-hidden border-l-4 border-brand-aqua bg-brand-deep-blue text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_80%_0%,rgba(17,170,159,0.35),transparent_70%)]" />
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
