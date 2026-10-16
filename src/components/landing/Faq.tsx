import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";

const display = "font-display tracking-[-0.02em]";

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "What is a design request tool?",
    a: "A shared place where people who need design work (marketing, social media, sales) send briefs, and the creative team picks them up, tracks them to done and gets them approved, instead of requests scattered across chat and email.",
  },
  {
    q: "Who is Clowork for?",
    a: "In-house creative teams and the people who brief them: requesters send and review work, designers get one queue sorted by deadline, leads assign work and see each person's workload and monthly target.",
  },
  {
    q: "Can it handle video requests?",
    a: "Yes. Any request can be flagged as needing motion, so video and animation jobs are visible and planned for.",
  },
  {
    q: "How do I get access?",
    a: "Clowork is in private beta. Join the waitlist with your work email and we'll reach out when there's a spot for your team. Already on a team that uses Clowork? Sign in.",
  },
];

/** Plain-text FAQ (native `<details>`, so it works without JavaScript and the answers stay in the page for search). */
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 border-t border-border bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 id="faq-title" className={cn(display, "text-3xl leading-tight font-bold text-heading sm:text-[2.75rem]")}>Questions</h2>
        <div className="mt-10 divide-y divide-border border-y border-border">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 text-base font-semibold text-heading [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-4 text-base leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
