import type { ReactNode } from "react";
import { Check, CheckCheck, Clapperboard, FilePlus2, MessageSquareText, Palette, UserCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { BrandTag, Chip } from "@/components/ui/Chip";
import { cn } from "@/components/ui/cn";

const display = "font-[family-name:var(--font-display)] tracking-[-0.02em]";

/* ---------- one small illustration per step: a decorative slice of the screen used at that step ---------- */

function Frame({ children }: { children: ReactNode }) {
  return <div aria-hidden="true" className="rounded-xl border border-border bg-surface p-3 text-[11px] shadow-card">{children}</div>;
}

function BriefForm() {
  return (
    <Frame>
      <p className="mb-1 text-foreground-secondary">Title</p>
      <p className="rounded-md border border-input/60 px-2 py-1.5 font-medium text-foreground">October feed, 9 posts</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <BrandTag name="Clogent" />
        <span className="inline-flex items-center gap-1 text-foreground-secondary"><Clapperboard className="size-3" />Motion</span>
      </div>
    </Frame>
  );
}

function AssignPicker() {
  const people = [{ name: "Raka", picked: true }, { name: "Sari" }, { name: "Dimas" }];
  return (
    <Frame>
      <p className="mb-1.5 text-foreground-secondary">Assign to</p>
      <ul className="space-y-1">
        {people.map((p) => (
          <li key={p.name} className={cn("flex items-center gap-2 rounded-md px-1.5 py-1", p.picked && "bg-accent")}>
            <Avatar name={p.name} size="sm" decorative />
            <span className={cn("flex-1", p.picked ? "font-medium text-accent-foreground" : "text-foreground")}>{p.name}</span>
            {p.picked ? <Check className="size-3.5 text-accent-foreground" strokeWidth={2.25} /> : null}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function WorkCard() {
  return (
    <Frame>
      <Chip tone="in-progress">On progress</Chip>
      <p className="mt-2 font-medium text-foreground">October feed, 9 posts</p>
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full w-3/5 rounded-full bg-[var(--status-in-progress-accent)]" />
        </div>
        <span className="text-foreground-secondary tabular-nums">6/9</span>
      </div>
    </Frame>
  );
}

function ReviewComment() {
  return (
    <Frame>
      <div className="flex gap-2">
        <Avatar name="Nadia" size="sm" decorative />
        <p className="rounded-lg rounded-tl-none bg-surface-muted px-2 py-1.5 leading-4 text-foreground">
          <span className="font-medium text-link">@Raka</span> love it. Can slide 3 use the aqua background?
        </p>
      </div>
      <p className="mt-2 text-right text-foreground-secondary">2 comments</p>
    </Frame>
  );
}

function DoneCount() {
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <Chip tone="done">Done</Chip>
        <span className="font-medium text-foreground tabular-nums">18 / 20</span>
      </div>
      <p className="mt-2 text-foreground-secondary">Raka&apos;s October target</p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full w-[90%] rounded-full bg-progress-mid" />
      </div>
    </Frame>
  );
}

/** The request lifecycle in the order it happens; each tone matches that stage's board colour. */
const STEPS: { title: string; body: string; icon: ReactNode; tone: string; art: ReactNode }[] = [
  { title: "Send the brief", body: "Title, brief link, brand, deadline and motion, in one form. No chat thread to dig through later.", icon: <FilePlus2 />, tone: "tag-clogent", art: <BriefForm /> },
  { title: "The lead assigns it", body: "New requests land in Requested. The lead picks a designer and it shows up in their queue.", icon: <UserCheck />, tone: "requested", art: <AssignPicker /> },
  { title: "Designers make it", body: "Drag the card to On progress. Everyone can see who is on what without asking.", icon: <Palette />, tone: "in-progress", art: <WorkCard /> },
  { title: "First look", body: "The requester reviews, comments and @mentions. Revisions stay next to the brief.", icon: <MessageSquareText />, tone: "first-look", art: <ReviewComment /> },
  { title: "Done, and counted", body: "Approved work moves to Done and counts toward the designer's monthly target.", icon: <CheckCheck />, tone: "done", art: <DoneCount /> },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="relative isolate scroll-mt-16 overflow-hidden border-y border-border bg-surface">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(50%_40%_at_50%_0%,rgba(17,170,159,0.10),transparent_70%)]" />
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="how-title" className={cn(display, "text-3xl leading-tight font-bold text-heading sm:text-[2.75rem]")}>How a request moves</h2>
          <p className="mt-4 text-base text-foreground-secondary sm:text-lg">
            The same five steps for every post, reel, banner and carousel. The board columns match them one to one.
          </p>
        </div>

        <ol className="relative mx-auto mt-14 grid max-w-4xl gap-10 lg:mt-16 lg:max-w-none lg:grid-cols-5 lg:gap-5">
          {/* Desktop connector through the icon centres, coloured stage by stage. */}
          <span aria-hidden="true"
            className="absolute top-7 right-[10%] left-[10%] hidden h-0.5 rounded-full bg-gradient-to-r from-[var(--status-tag-clogent-accent)] via-[var(--status-first-look-accent)] to-[var(--status-done-accent)] opacity-60 lg:block" />
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative pl-20 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-x-10 lg:block lg:pl-0 lg:text-center">
              {/* Phone and tablet: one step per row, joined by a vertical line. Tablet puts the illustration beside the text. */}
              {i < STEPS.length - 1 ? (
                <span aria-hidden="true" className="absolute top-16 -bottom-10 left-7 w-0.5 bg-border lg:hidden" />
              ) : null}
              <div data-tone={step.tone} className="absolute top-0 left-0 lg:relative lg:mx-auto lg:w-fit">
                <span aria-hidden="true"
                  className="flex size-14 items-center justify-center rounded-2xl bg-tone-tint text-tone-text shadow-card ring-4 ring-surface [&_svg]:size-6">
                  {step.icon}
                </span>
                <span className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-tone-accent text-[11px] font-bold text-white ring-2 ring-surface tabular-nums">
                  <span className="sr-only">Step </span>{i + 1}
                </span>
              </div>
              <div className="md:pt-2 lg:pt-0">
                <h3 className="text-base font-semibold text-heading lg:mt-5">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground-secondary lg:min-h-[5.75rem]">{step.body}</p>
              </div>
              <div className="mt-5 max-w-xs text-left md:mt-0 md:max-w-none lg:mt-5">{step.art}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
