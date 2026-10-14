# shadcn-first UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every generic UI element comes from shadcn/ui (`src/components/shadcn/`) restyled with our tokens, token class names follow shadcn, and the kit (`src/components/ui/`) keeps only domain components, without changing how the app looks except where the audit found drift.

**Architecture:** Add each shadcn component with the CLI, restyle it to today's kit look (sizes, radius, shadows, tokens) and give it the kit's extra props in its own file, then migrate call sites and delete the kit file. Each kit component is replaced in its own task with tests first; static guard tests keep the old patterns from coming back. Domain components (`StatusChip`, `EmptyState`, `Avatar`, `ProgressBar`, route `Modal`…) keep their API and compose shadcn parts.

**Tech Stack:** Next.js 16 (App Router, cacheComponents), React 19.3, TypeScript 5, Tailwind CSS 4 (`@theme inline`, `@custom-variant dark` on `data-theme`), `radix-ui` 1.7 (unified package), `class-variance-authority`, `tailwind-merge` 3, lucide-react, Vitest 5 + Testing Library (jsdom per file via `// @vitest-environment jsdom`).

**Spec:** `docs/superpowers/specs/2026-10-14-shadcn-first-design.md` (audit, decisions) and `src/components/ui/README.md` (rules, token tables, component map).

## Global Constraints

- Work only on branch `feat/shadcn-first`; the starting point is tagged `pre-shadcn-migration` (= `7e10e74`, pushed as `origin/feat/project-page`). Never commit to `feat/project-page`.
- One commit or more per task; never mix two tasks in one commit (each task must be revertable with `git revert`).
- Controls 36px (`h-9`); `size="sm"` 32px (`h-8`) with a 36px hit area (`relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']`); icon buttons `size-9` / `size-8`.
- Radius: controls `rounded-lg`, cards and dialogs `rounded-xl`, badges `rounded-md`, pills/avatars `rounded-full`.
- Depth: cards `shadow-card`; popovers, menus, dialogs, sheets `shadow-raised`. No `shadow-lg`/`shadow-xl`.
- Motion: `transition-colors duration-150 ease-out`; overlays open/close with `data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out`. `tw-animate-css` is NOT installed: no `animate-in`, `fade-in-*`, `zoom-in-*`, `slide-in-from-*` classes.
- Focus: keep `focusRing` from `@/components/ui/cn` (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`); strip shadcn's `focus-visible:ring-[3px] focus-visible:ring-ring/50`.
- Type: base 14px; `text-compact` = 13px (tables, labels, sm buttons); badges/meta 12px; nothing below 12px except `src/components/landing/**` and avatar initials in `src/components/ui/Avatar.tsx`. Dialog and card titles `text-base font-semibold`.
- Tokens: shadcn names (`bg-card`, `bg-popover`, `bg-muted`, `text-muted-foreground`, `border-input`…); extensions only per README (`text-heading`, `text-link`, `text-danger`, `placeholder:text-placeholder`, `border-border-strong`, `hover:bg-primary-hover`, `shadow-card`, `data-tone`). No hex, no Tailwind palette colours, no `dark:` in `src/components/shadcn/`.
- `cn` is ours (`@/components/ui/cn`, strings only); the CLI already maps `utils` to it.
- Disabled: buttons, menu items, toggles `disabled:opacity-55`; fields `disabled:bg-muted disabled:opacity-70`.
- Keep every accessible name, role and `aria-*` an existing test queries; when a test asserts implementation DOM (native `<dialog>`, class lists), update it to the new structure without dropping what it checks for the user.
- React 19: refs are plain props; no `forwardRef` in new code.
- Server-safe stays server-safe: only files using Radix state/hooks get `"use client"` (button, input, card, badge, alert, skeleton, table stay server components).
- CLI: `npx shadcn@latest add <names>`; never pass `--overwrite`; answer **No** to every overwrite prompt; after each run, `git diff -- package.json package-lock.json src/app/globals.css` and revert anything the CLI added there except new Radix-free runtime deps it truly needs (no `tw-animate-css`, no new CSS variables).
- Before pushing: `npm run typecheck`, `npm test`, `npm run lint`, and `npx next build` with the untracked `scripts/check-login.local.ts` moved aside and restored (`trap`).
- Browser QA only on localhost, signed in with `LOCAL_QA_EMAIL`/`LOCAL_QA_PASSWORD` from `.env`; check light, dark and 375px width.

## Review Focus

1. **A `<Button>` inside a `<form>` without `type`** must not submit the form (the kit defaulted to `type="button"`; shadcn's Button sets no type). Test in Task 4.
2. **A `<Button>` without `variant`** must not silently turn primary (kit default was secondary, shadcn default is primary). Every call site passes an explicit `variant`; guard test in Task 4.
3. **Plain server-action forms** must still post every field after controls become shadcn (`NativeSelect`, `Switch`, `Checkbox`, `RadioGroup`, `DatePicker`'s hidden input). `FormData` tests in Tasks 6 and 12.
4. **Route modal and nested dialogs**: Esc, the X and a backdrop click call `router.back()` exactly once; Esc inside `DoneDialog` (open over the request panel) closes only `DoneDialog`; a route hidden by Next (Activity) leaves no overlay on screen; focus returns to the opener when a local dialog or menu closes. Tests in Tasks 13–14, browser check in Task 13.
5. **CLI code leaking shadcn defaults** (`dark:` utilities, tw-animate classes, palette colours, `ring-[3px]`) changes the look in dark mode or does nothing. Guard test in Task 1 covers every file in `src/components/shadcn/`.

---

### Task 1: Guardrails for the shadcn folder

**Files:**
- Create: `tests/shadcnFolder.test.tsx`
- Modify: `tests/shadcnCleanup.test.tsx` (delete the `describe("unused shadcn files are gone")` block; the folder-listing assertion would block every later task)

**Interfaces:**
- Produces: `tests/helpers/srcFiles.ts` exporting `srcFiles(dir: string, ext?: RegExp): string[]` (recursive, skips `node_modules`, `.next`) and `jsxOpenings(tag: string, files: string[]): { file: string; line: number; attrs: string[] }[]` (uses the `typescript` compiler API to find `<Tag …>` / `<Tag …/>` and list attribute names; spreads appear as `"..."`). Later guard tests use both.

- [ ] **Step 1: Baseline.** Run `npm run typecheck` and `npm test`; save the list of already-failing tests to the scratchpad (not committed). Any test failing here is not this migration's to fix.
- [ ] **Step 2: Write `tests/helpers/srcFiles.ts`** with the two functions above.
- [ ] **Step 3: Write `tests/shadcnFolder.test.tsx`**, for every `src/components/shadcn/*.tsx`:
  - `it("uses no tw-animate-css utilities")`: no match for `/animate-in|animate-out|fade-in|fade-out|zoom-in|zoom-out|slide-in-from|slide-out-to/`.
  - `it("has no dark: variants")`: no match for `/\bdark:/`.
  - `it("uses tokens, not literal colours")`: no match for `/#[0-9a-fA-F]{3,8}\b|\b(?:bg|text|border|ring|fill|stroke)-(?:red|green|blue|amber|yellow|gray|slate|zinc|neutral|stone|white|black)(?:-\d+)?\b/`.
  - `it("keeps our focus ring, not shadcn's 3px ring")`: no match for `/ring-\[3px\]/`.
  - `it("imports cn from @/components/ui/cn")`: every file that calls `cn(` imports it from there.
- [ ] **Step 4: Run** `npx vitest run tests/shadcnFolder.test.tsx tests/shadcnCleanup.test.tsx`. Expected: PASS (fix the current three files if a rule fails, keeping their tests green).
- [ ] **Step 5: Commit** `test(ui): guard rules for every shadcn component file`.

### Task 2: Token names follow shadcn

**Files:**
- Create: `tests/tokenNames.test.ts`
- Modify: every `src/**/*.{ts,tsx}` using the aliases; `src/app/globals.css` (`@theme inline` block, ~line 285); test files asserting old class names (`tests/boardRedesign.test.tsx`, `tests/shadcnCleanup.test.tsx`, `tests/kitReviewFixes.test.tsx`, `tests/shellNavGating.test.tsx`, `tests/requestTableRedesign.test.tsx`, `tests/projectLifecycleUi.test.tsx`, `tests/datePicker.test.tsx`); `src/components/ui/README.md` (drop the "Aliases being retired" table, say they were removed).

- [ ] **Step 1: Write `tests/tokenNames.test.ts`**:
  - `it("no class uses a retired alias")`: over `srcFiles("src", /\.(ts|tsx)$/)`, no match for `/(?<![\w-])(?:[\w\[\]=&-]+:)*(?:bg|text|border|ring|from|via|to|fill|stroke|outline|divide|decoration|caret|accent|shadow)-(?:surface-muted|surface|foreground-secondary)(?![\w-])/` (does not match `sidebar-foreground-secondary` or `--surface`).
  - `it("globals.css no longer maps the aliases to Tailwind colours")`: `globals.css` has no `--color-surface:`, `--color-surface-muted:`, `--color-foreground-secondary:` (the raw `--surface`, `--surface-muted`, `--foreground-secondary` variables stay: `--card`, `--muted`, `--muted-foreground` point at them).
- [ ] **Step 2: Run** `npx vitest run tests/tokenNames.test.ts`. Expected: FAIL (≈440 matches).
- [ ] **Step 3: Rename** with a one-off Node script (scratchpad, not committed), in this order, keeping prefixes/variants and `/NN` opacity suffixes: `-surface-muted` → `-muted`; `-surface` → `-card` (inside `PopoverContent`/menus use `-popover`; same value); `-foreground-secondary` → `-muted-foreground` except when preceded by `sidebar-`. Remove the three `--color-*` alias lines from `@theme inline`. Update the listed tests' expected class names.
- [ ] **Step 4: Run** `npx vitest run tests/tokenNames.test.ts tests/theme.test.ts`, then `npm run typecheck` and `npm test`. Expected: PASS; no test newly failing versus the baseline.
- [ ] **Step 5: Browser spot check**: `/requests` board and a request panel, light and dark. Expected: pixel-identical (values are the same).
- [ ] **Step 6: Commit** `refactor(ui): use shadcn token names (card, muted, muted-foreground)`.

### Task 3: Type scale and section titles

**Files:**
- Create: `tests/typeScale.test.ts`
- Modify: `src/app/globals.css` (`@theme inline`: `--text-compact: 0.8125rem; --text-compact--line-height: 1.125rem;`); all `text-[13px]` users; sub-12px users (`CalendarCard`, `briefs/BriefCalendar`, `chat/ChatConversation`, `chat/ChatList`, `content/PostTile`, `shell/NotificationBellView`, `shell/DisabledNavItem`); section titles in `ProjectTable.tsx:121`, `ui/CollapsibleSection.tsx:34`, `kpi/KpiSection.tsx:14`, `PageSkeletons.tsx:81`.

- [ ] **Step 1: Write `tests/typeScale.test.ts`**:
  - `it("no arbitrary font size below 12px outside the allowlist")`: no `text-\[(?:[0-9]|1[01])px\]` in `src/**/*.tsx` except files under `src/components/landing/` and `src/components/ui/Avatar.tsx`.
  - `it("13px is the text-compact token")`: no `text-[13px]` anywhere in `src`; `globals.css` defines `--text-compact`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Replace** `text-[13px]` → `text-compact`; sub-12px → `text-xs`; the four section `<h2>`s → `text-base font-semibold text-heading` (KPI section keeps `font-display` only if its sibling page sections do). `TodayOverview`'s greeting (`text-2xl`) is a hero line, not a section title: leave it.
- [ ] **Step 4: Run** the test, `npm run typecheck`, `npm test`. Expected: PASS.
- [ ] **Step 5: Browser check** at 375px and desktop: request calendar, brief calendar, chat dock, content plan grid. Expected: no text overflowing its card or cell (12px is 1–2px larger than before).
- [ ] **Step 6: Commit** `style(ui): text-compact token, nothing below 12px, one section-title style`.

### Task 4: Button (replaces `ui/Button`, `ui/IconButton`, `buttonClass`)

**Files:**
- Create: `src/components/shadcn/button.tsx` (CLI), `tests/shadcnButton.test.tsx`, `tests/buttonUsage.test.ts`
- Modify: the 56 `Button` / 16 `IconButton` / 26 `buttonClass` importers; `ui/SubmitButton.tsx`; local rebuilt buttons in `content/MediaStrip.tsx` (`iconBtn`), `kpi/MonthPicker.tsx` (`yearBtn`), `chat/ChatConversation.tsx:162`, `shell/AppFrame.tsx:82,110,131`; `tests/uiKit.test.tsx` (move Button/IconButton cases out)
- Delete: `src/components/ui/Button.tsx`, `src/components/ui/IconButton.tsx`

**Interfaces:**
- Produces: `buttonVariants({ variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "link"; size?: "default" | "sm" | "icon" | "icon-sm"; className?: string }): string` and `Button(props: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean; icon?: React.ReactNode; iconRight?: React.ReactNode })`, both from `@/components/shadcn/button`. `type` defaults to `"button"` when not `asChild`. Variant classes: `default` = kit primary; `outline` = kit secondary (`border border-border-strong bg-card text-foreground shadow-card hover:bg-muted`); `ghost` = kit ghost; `destructive` = kit danger; `secondary` = `bg-muted text-foreground hover:bg-muted/80`; `link` = `text-link underline-offset-4 hover:underline`.

- [ ] **Step 1: Add** `npx shadcn@latest add button`; apply the CLI rules from Global Constraints.
- [ ] **Step 2: Write `tests/shadcnButton.test.tsx`** (jsdom):
  - `it("defaults to type=button, so it never submits a form by accident")`: inside `<form onSubmit={spy}>`, click → `spy` not called; `type="submit"` → called.
  - `it("maps variants to the kit look")`: `default` has `bg-primary`; `outline` has `border-border-strong` and `bg-card`; `ghost` has `text-muted-foreground`; `destructive` has `bg-destructive`.
  - `it("sizes: 36px default, 32px sm with a 36px hit area, square icon sizes")`: `h-9`; `h-8` + `after:-inset-y-0.5`; `size-9`; `size-8`.
  - `it("loading shows a spinner, sets aria-busy, disables, keeps the label")`.
  - `it("renders icon before and iconRight after the label")`.
  - `it("asChild renders the Link itself with button classes and no type")`.
- [ ] **Step 3: Run it.** Expected: FAIL until Step 4.
- [ ] **Step 4: Restyle `button.tsx`** to the Interfaces above (Slot from `radix-ui`, `focusRing`, `disabled:opacity-55`, `[&_svg]:size-4`; icon sizes use `[&_svg]:size-[18px]`).
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Write `tests/buttonUsage.test.ts`**: `it("every <Button> passes an explicit variant")` using `jsxOpenings("Button", srcFiles("src"))` → every opening has `variant` (or a `...` spread); `it("buttonClass is gone")`: no `buttonClass(` in `src`. Create `tests/kitRemoved.test.ts`: `it("removed kit files stay removed")` with a `REMOVED` list (`Button`, `IconButton`): each `src/components/ui/<name>.tsx` is absent and nothing in `src` or `tests` imports it. Later tasks append to `REMOVED`.
- [ ] **Step 7: Migrate** call sites with this map, then delete the kit files:

  | Kit | shadcn |
  |---|---|
  | `<Button>` with no `variant` | `<Button variant="outline">` |
  | `variant` primary / secondary / ghost / danger | default / outline / ghost / destructive |
  | `size` md / sm | default / sm |
  | `block` | `className="w-full"` |
  | `<IconButton icon={x} aria-label="L" size variant>` | `<Button size="icon"\|"icon-sm" variant="ghost"\|"outline" aria-label="L" title="L">{x}</Button>` |
  | `<Link className={buttonClass(o)}>` | `<Button asChild variant size><Link/></Button>` |
  | `buttonClass(o)` on a non-link element (`summary`, `label`) | `buttonVariants(o)` |

  `MediaStrip`'s 20px overlay buttons stay small (inside a media tile) but use `buttonVariants({ variant: "ghost", size: "icon-sm" })` plus their size override.
- [ ] **Step 8: Run** `npx vitest run tests/shadcnButton.test.tsx tests/buttonUsage.test.ts tests/uiKit.test.tsx tests/submitButton.test.tsx`, `npm run typecheck`, `npm test`. Expected: PASS.
- [ ] **Step 9: Browser check**: new request form (one primary), request panel actions, admin users, library row actions, sign-in. Expected: same look as before.
- [ ] **Step 10: Commit** (two commits: `feat(ui): shadcn Button styled like the kit` and `refactor(ui): migrate buttons to shadcn Button`).

### Task 5: Input, Textarea, Label, Field parts (replaces `fieldClass`, `labelClass`, `hintClass`, `FieldError`)

**Files:**
- Create: `src/components/shadcn/{input,textarea,label,field}.tsx` (CLI), `tests/shadcnField.test.tsx`
- Modify: the 35 `Field` importers, including helpers `components/admin/AdminForm.tsx` (`control`, `selectControl`), the `props()`/`f()` helpers in `NewRequestForm`, `ProjectForm`, `content/ApproveForm`, `content/PostPanelEditor`, `content/ChannelForm`, `library/ItemDialog`; `help/HelpSearch.tsx:22`; `ui/DatePicker.tsx`, `ui/PasswordInput.tsx` (trigger/input styling); `tests/shadcnCleanup.test.tsx` (Select trigger now compared with `Input`'s classes instead of `fieldClass`)
- Delete: `src/components/ui/Field.tsx` (after Task 6, which still needs nothing from it: do the deletion at the end of Task 6)

**Interfaces:**
- Produces: `Input(props: Omit<React.ComponentProps<"input">, "size"> & { size?: "default" | "sm" })`, `Textarea(props: React.ComponentProps<"textarea">)`, `Label` (Radix), `labelClassName: string` (from `label.tsx`, for `<legend>`/`<span>` labels), `Field`, `FieldLabel`, `FieldDescription`, `FieldError(props: React.ComponentProps<"div">)` (renders nothing without children; CircleAlert icon + message; keeps the `id` it is given). Error styling comes only from `aria-invalid` (`aria-invalid:border-danger`).

- [ ] **Step 1: Add** `npx shadcn@latest add input textarea label field`; CLI rules.
- [ ] **Step 2: Write `tests/shadcnField.test.tsx`**:
  - `it("Input is 36px with the kit's outline, surface, text and placeholder tokens")`: classes include `h-9 rounded-lg border-input bg-card text-sm placeholder:text-placeholder`; `size="sm"` → `h-8`.
  - `it("aria-invalid swaps to the danger border")`: class contains `aria-invalid:border-danger`.
  - `it("disabled fields use the muted surface")`: `disabled:bg-muted disabled:opacity-70`.
  - `it("Textarea is at least 96px with 8px vertical padding")`: `min-h-24 py-2`.
  - `it("FieldError renders icon + message with the given id, nothing when empty")`.
  - `it("Label is 13px/500")`: `text-compact font-medium`.
- [ ] **Step 3: Run it.** Expected: FAIL. **Step 4: Restyle** the four files to pass. **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Migrate**: `<input className={fieldClass(o)}>` → `<Input>` (`size: "sm"` → `size="sm"`); `<textarea …>` → `<Textarea>`; `fieldClass({ invalid: x })` → drop it and make sure the element has `aria-invalid={x || undefined}`; `labelClass` on `<label>` → `<Label>`, elsewhere → `labelClassName`; `hintClass` → `<FieldDescription>`; `FieldError` import path only. Helpers stop returning `className`. `<select>`s keep `fieldClass({ kind: "select" })` until Task 6.
- [ ] **Step 7: Run** `npm run typecheck`, `npm test`. Expected: PASS.
- [ ] **Step 8: Browser check**: sign-in, sign-up, verify, new request (with a validation error), project form, admin user form, library item dialog, help search. Expected: same look; error borders appear on invalid fields.
- [ ] **Step 9: Commit** (component commit + migration commit).

### Task 6: NativeSelect (replaces `<select className={fieldClass({ kind: "select" })}>`)

**Files:**
- Create: `src/components/shadcn/native-select.tsx` (CLI), `tests/shadcnNativeSelect.test.tsx`
- Modify: every form `<select>` (`ProjectForm`, `NewRequestForm`, `admin/users/{PersonRoleFields,UserForms}`, `requests/[id]/DetailForms`, `projects/ProjectItemRow`, `content/{ApproveForm,PostPanelEditor,ChannelForm}`, `library/{LibraryView,ItemDialog}`, `kpi/project/YearSelect`, `FilterBar` (keeps its toolbar pill classes via `className`))
- Delete: `src/components/ui/Field.tsx`

**Interfaces:**
- Produces: `NativeSelect(props: Omit<React.ComponentProps<"select">, "size"> & { size?: "default" | "sm" })` — wrapper is `w-full` by default and receives `className` width classes; the `<select>` carries the `Input` look plus `pr-8` and a `ChevronDown` in `text-muted-foreground`. Options stay plain `<option>`.

- [ ] **Step 1: Add** `npx shadcn@latest add native-select`; CLI rules.
- [ ] **Step 2: Write tests**:
  - `it("looks like Input: same height, radius, outline and surface")`: the select's classes include `Input`'s `h-9 rounded-lg border-input bg-card`.
  - `it("posts its value in a plain form")`: `<form><NativeSelect name="brandId" defaultValue="b"><option value="a">A</option><option value="b">B</option></NativeSelect></form>` → `new FormData(form).get("brandId") === "b"`.
  - `it("is full width by default; className widths go to the wrapper")`.
  - `it("keeps the accessible name from its label")`: `getByRole("combobox", { name })`.
- [ ] **Step 3–5: Run (FAIL), restyle, run (PASS).**
- [ ] **Step 6: Migrate** the selects; delete `ui/Field.tsx`; append `Field` to `REMOVED` in `tests/kitRemoved.test.ts`.
- [ ] **Step 7: Run** `npm run typecheck`, `npm test`. **Step 8: Browser check** at 375px: native picker opens on the new-request brand/division selects; FilterBar pills unchanged.
- [ ] **Step 9: Commit.**

### Task 7: Card (replaces `ui/Card` and ~20 inline cards)

**Files:**
- Create: `src/components/shadcn/card.tsx` (CLI), `tests/shadcnCard.test.tsx`, `tests/cardUsage.test.ts`
- Modify: 18 `Card` importers; inline cards in `admin/users/RequestsList.tsx`, `TodayOverview.tsx`, `kpi/project/ProjectKpiPanel.tsx`, `kpi/project/TargetList.tsx`, `kpi/sections/{MyRequestsSection,MyProjectsSection}.tsx`, `timeline/{TimelineList,TimelineChart}.tsx`, `projects/ProjectItemRow.tsx`, `RequestTable.tsx`, `notifications/NotificationsContent.tsx`, `requests/new/NewRequestContent.tsx`, `change-password/page.tsx`, `PageSkeletons.tsx`, `RequestSkeletons.tsx`, `briefs/BriefCalendar.tsx`
- Delete: `src/components/ui/Card.tsx`

**Interfaces:**
- Produces: `Card` (`rounded-xl border border-border bg-card text-card-foreground shadow-card p-4`; `p-0` for edge-to-edge tables), `CardHeader` (`mb-3` grid: title column + `CardAction`), `CardTitle(props: React.ComponentProps<"h2"> & { as?: "h2" | "h3" | "h4" })` (`text-base font-semibold text-foreground`, renders `h2` by default — shadcn's is a div, ours must stay a heading), `CardDescription`, `CardAction`, `CardContent`, `CardFooter`.

- [ ] **Step 1: Add** `npx shadcn@latest add card`; CLI rules.
- [ ] **Step 2: Write tests**: `it("card surface: radius, border, card token, resting shadow, 16px padding")`; `it("CardTitle is an h2 by default and h3 with as='h3'")`; `it("CardAction sits in the header's second column")`.
- [ ] **Step 3–5: Run (FAIL), restyle, run (PASS).**
- [ ] **Step 6: Write `tests/cardUsage.test.ts`**: `it("no card is rebuilt from raw classes")`: no `.tsx` outside `src/components/shadcn/` has a `className` string containing all of `rounded-xl`, `border`, `bg-card` (allowlist: `ui/KpiTile.tsx`, `BoardCard.tsx` `CARD_SURFACE` — drag cards with their own hover shadow; justify each allowlisted file in a comment).
- [ ] **Step 7: Migrate**: `padded={false}` → `className="p-0"`; `<CardHeader actions={a}>x</CardHeader>` → `<CardHeader>x<CardAction>{a}</CardAction></CardHeader>`; inline cards → `<Card>`. Append `Card` to `tests/kitRemoved.test.ts`.
- [ ] **Step 8: Run** typecheck and `npm test`. **Step 9: Browser check**: dashboard, KPI, projects, notifications, admin requests. **Step 10: Commit.**

### Task 8: Badge (replaces `Chip`, `CountPill`; `BrandTag`, `StatusChip`, `DeadlineChip`, `NeedsMotionChip` compose it)

**Files:**
- Create: `src/components/shadcn/badge.tsx` (CLI), `src/components/ui/BrandTag.tsx`, `tests/shadcnBadge.test.tsx`
- Modify: 24 `Chip` importers; `ui/{StatusChip,DeadlineChip,NeedsMotionChip}.tsx`
- Delete: `src/components/ui/Chip.tsx`

**Interfaces:**
- Produces: `Badge(props: React.ComponentProps<"span"> & { tone?: Tone; variant?: "default" | "count"; asChild?: boolean })` — `default`: `data-tone={tone ?? "tag-neutral"}`, `rounded-md bg-tone-tint px-2 py-0.5 text-xs leading-4 font-medium text-tone-text [&_svg]:size-3.5`; `count`: `rounded-full bg-muted text-muted-foreground tabular-nums min-w-6`. `BrandTag({ name, className })` in `ui/BrandTag.tsx` = `<Badge tone={brandTone(name)}>`.

- [ ] **Step 1: Add** `npx shadcn@latest add badge`; CLI rules.
- [ ] **Step 2: Port tests** from `tests/uiKit.test.tsx` "Chip / BrandTag / CountPill" into `tests/shadcnBadge.test.tsx` (tone attribute, tone tokens only, brand tones, tabular count) plus `it("StatusChip renders a Badge with icon + label")`.
- [ ] **Step 3–5: Run (FAIL), restyle, run (PASS).**
- [ ] **Step 6: Migrate**: `<Chip tone icon>` → `<Badge tone>{icon}…</Badge>`; `<CountPill value aria-label>` → `<Badge variant="count" aria-label>{value}</Badge>`; `BrandTag` import path. Append `Chip` to `tests/kitRemoved.test.ts`.
- [ ] **Step 7: Run** typecheck, `npm test` (`needsMotionBadge`, `boardCard`, `requestTableRedesign` cover chips). **Step 8: Browser check** board and table. **Step 9: Commit.**

### Task 9: Alert (replaces `ui/Alert`)

**Files:**
- Create: `src/components/shadcn/alert.tsx` (CLI), `tests/shadcnAlert.test.tsx`
- Modify: 30 `Alert` importers
- Delete: `src/components/ui/Alert.tsx`

**Interfaces:**
- Produces: `Alert(props: React.ComponentProps<"div"> & { variant?: "default" | "success" | "warning" | "destructive"; icon?: React.ReactNode | false; role?: "alert" | "status" | null })` — tone mapping `default`→`in-progress`, `success`→`done`, `warning`→`due-soon`, `destructive`→`cancelled` via `data-tone`; default icon per variant (Info, CircleCheck, TriangleAlert, CircleAlert) unless `icon` given or `false`; role defaults to `"alert"` for `destructive`, `"status"` otherwise, none for `null`. `AlertTitle` (`font-semibold`), `AlertDescription`, `AlertAction` (right-aligned slot, ours).

- [ ] **Step 1: Add** `npx shadcn@latest add alert`; CLI rules.
- [ ] **Step 2: Port tests** ("danger is an alert; others are status", "role={null} renders static text with title and icon") to the new API.
- [ ] **Step 3–5: Run (FAIL), restyle, run (PASS).**
- [ ] **Step 6: Migrate**: `<Alert tone="danger" title={t} action={a} role id>{m}</Alert>` → `<Alert variant="destructive" role id>{t && <AlertTitle>{t}</AlertTitle>}<AlertDescription>{m}</AlertDescription>{a && <AlertAction>{a}</AlertAction>}</Alert>` (info→default, success, warning, danger→destructive). Append `Alert` to `tests/kitRemoved.test.ts`.
- [ ] **Step 7: Run** typecheck, `npm test` (`formErrors`, `detailForms` cover announced errors). **Step 8: Commit.**

### Task 10: Empty state (EmptyState composes shadcn `Empty`; ad-hoc empty lines migrate)

**Files:**
- Create: `src/components/shadcn/empty.tsx` (CLI), `tests/emptyState.test.tsx`
- Modify: `src/components/ui/EmptyState.tsx`; ad-hoc empties in `projects/[id]/MilestoneList.tsx:24`, `admin/users/RequestsList.tsx:30`, `admin/users/InviteLinkCard.tsx:45`, `requests/[id]/RequestDetailView.tsx:136,159,183`, `notifications/NotificationsContent.tsx:25`, `Board.tsx:203`, `library/LibraryView.tsx:181`, `timeline/TimelineList.tsx:19`, `kpi/sections/MyProjectsSection.tsx:32`

**Interfaces:**
- Produces: `EmptyState(props: { icon?; art?; title: string; description?; action?; titleAs?: "p" | "h1" | "h2" | "h3"; role?: "alert" | "status"; size?: "page" | "inline"; className?; children? })` — `page` (default) = today's look built from `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`; `inline` = no border, no media, `py-3 text-sm text-muted-foreground`, left-aligned, title only (for "No links yet." inside a card).

- [ ] **Step 1: Add** `npx shadcn@latest add empty`; CLI rules.
- [ ] **Step 2: Write tests**: existing "headline, one line and an action" kept; `it("titleAs='h1' renders a page heading")`; `it("inline is a quiet line without border or icon")`.
- [ ] **Step 3–5: Run (FAIL), rebuild `EmptyState` on `Empty`, run (PASS).**
- [ ] **Step 6: Migrate** the ad-hoc empties to `<EmptyState size="inline" title="…" />` (table-cell empties like `InvitedList.tsx:37` stay a muted `<td>`). Keep the exact copy.
- [ ] **Step 7: Run** typecheck, `npm test`. **Step 8: Commit.**

### Task 11: Display primitives — Skeleton, Spinner, Avatar, Progress, Separator

**Files:**
- Create: `src/components/shadcn/{skeleton,spinner,avatar,progress,separator}.tsx` (CLI), `tests/shadcnDisplay.test.tsx`
- Modify: `ui/Skeleton.tsx` → delete after migrating 12 importers; `ui/Avatar.tsx` (composes shadcn `Avatar`, `AvatarImage`, `AvatarFallback`; API unchanged); `ui/ProgressBar.tsx` and `kpi/ProgressBar.tsx` (compose shadcn `Progress`; label/value text/over-100% check unchanged); `LoaderCircle animate-spin` spinners → `Spinner`
- Delete: `src/components/ui/Skeleton.tsx`, `src/components/ui/Divider.tsx` (no importers)

**Interfaces:**
- Produces: `Skeleton(props: React.ComponentProps<"div">)` (`animate-pulse rounded-md bg-border`, `aria-hidden`, `data-skeleton`), `Spinner(props: React.ComponentProps<"svg">)` (`LoaderCircle`, `animate-spin`, `role="status"` + `aria-label="Loading"` unless `aria-hidden`), `Avatar*`, `Progress(props: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string })`, `Separator`.

- [ ] **Step 1: Add** the five; CLI rules.
- [ ] **Step 2: Write tests**: skeleton hidden from assistive tech; spinner announced as Loading; Avatar keeps initials, name, palette variables, decorative mode (port `uiKit` Avatar cases and `avatarPhoto`); ProgressBar keeps progressbar semantics, clamping and no-NaN (port).
- [ ] **Step 3–5: Run (FAIL), implement, run (PASS).**
- [ ] **Step 6: Migrate** `<Skeleton rounded="full">` → `className="rounded-full"` (`xl` → `rounded-xl`); spinners. Append `Skeleton`, `Divider` to `tests/kitRemoved.test.ts`.
- [ ] **Step 7: Run** typecheck, `npm test`. **Step 8: Commit.**

### Task 12: Form toggles — Switch, Checkbox, RadioGroup

**Files:**
- Create: `src/components/shadcn/{switch,checkbox,radio-group}.tsx` (CLI), `tests/shadcnToggles.test.tsx`
- Modify: `ui/Switch.tsx` (2 importers; row-with-label API kept, composes shadcn `Switch`), `ui/RadioCards.tsx` (composes `RadioGroup`/`RadioGroupItem`; card look and API kept), bare `type="checkbox"` inputs with `accent-primary` (5) → `Checkbox`

**Interfaces:**
- Produces: `Switch`, `Checkbox`, `RadioGroup`, `RadioGroupItem` (Radix), styled with `bg-primary` checked state, `border-input` unchecked, `focusRing`, `disabled:opacity-55`.

- [ ] **Step 1: Add**; CLI rules.
- [ ] **Step 2: Write tests**:
  - `it("Switch posts on/off in a plain form")`: checked → `FormData.get(name) === "on"`; unchecked → `null`.
  - `it("Checkbox posts its value in a plain form")`.
  - `it("RadioCards posts the chosen value and each radio is named by its card title")` (port the existing "real radio inputs" case to role `radio` + accessible name).
  - `it("Switch row: whole row is the label, role=switch, description linked")`.
- [ ] **Step 3–5: Run (FAIL), implement, run (PASS).**
- [ ] **Step 6: Migrate** the checkboxes; run `npm test` (`newRequestForm`, `needsMotion`, `adminMembers`, `settings-page` cover these forms).
- [ ] **Step 7: Browser check**: new request "Does this task need motion?", needs-motion checkbox on a request, Invite link "Link is on" switch, keyboard (Space toggles, arrows move radios). **Step 8: Commit.**

### Task 13: Dialogs — Dialog, AlertDialog, Sheet; route Modal and local dialogs

**Files:**
- Create: `src/components/shadcn/{dialog,alert-dialog,sheet}.tsx` (CLI), `tests/dialogs.test.tsx`, `tests/overlayUsage.test.ts`
- Modify: `src/components/ui/Modal.tsx` (route modal: `side="center"` → `Dialog`, `side="right"` → `Sheet side="right"`; API unchanged), `calendar/DayDialog.tsx`, `library/LibraryDialog.tsx` (used by `ItemDialog`, `CategoriesDialog`, `kpi/project/ManageTargetsModal`), `briefs/BriefDayDialog.tsx`, `DoneDialog.tsx`; tests touching dialogs (`routeModal`, `requestPanelRoute`, `requestCalendar`, `briefCalendarView`, `libraryEditor`, `libraryE2E`, `kpiUi`, `detailForms`, …: the 16 files matching `showModal|<dialog|getByRole("dialog")`)

**Interfaces:**
- Consumes: `Button` (`size="icon" variant="ghost" aria-label="Close"`) from Task 4.
- Produces: `Dialog`, `DialogTrigger`, `DialogContent(props & { showClose?: boolean })` (`rounded-xl border bg-background shadow-raised`, overlay `bg-[var(--backdrop)]`, `animate-pop-in/out`, close button top-right), `DialogHeader`, `DialogTitle` (`text-base font-semibold text-heading`), `DialogDescription`, `DialogFooter`; `AlertDialog*` likewise; `Sheet`, `SheetContent(props & { side?: "right" | "left" })` (full width under `sm`, `sm:w-[min(64rem,92vw)] lg:w-[62vw]` for the request panel via className), `SheetHeader`, `SheetTitle`.

- [ ] **Step 1: Add** `npx shadcn@latest add dialog alert-dialog sheet`; CLI rules (the CLI will want to overwrite `button.tsx`: answer No).
- [ ] **Step 2: Write `tests/dialogs.test.tsx`**:
  - `it("route Modal goes back once on Close, Esc and an overlay click, not on a click inside")` (mock `useRouter().back`).
  - `it("route Modal closes when unmounted and leaves no overlay or scroll lock")`.
  - `it("side=right is a labelled sheet with actions next to Close")`.
  - `it("Esc in DoneDialog over the request sheet closes only DoneDialog")`.
  - `it("a local dialog returns focus to the button that opened it")` (DayDialog "+N more").
  - `it("dialog titles are 16px semibold heading colour")`.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Rebuild `Modal`**: `const [open, setOpen] = useState(false); useEffect(() => { setOpen(true); return () => setOpen(false); }, [])` so a route hidden by Next's Activity closes its portal; `onOpenChange={(o) => { if (!o) router.back(); }}`. Remove the manual `documentElement.style.overflow` handling (Radix locks scroll).
- [ ] **Step 5: Migrate** the four local dialogs to `Dialog` (`DoneDialog`: drop its manual Escape `preventDefault` workaround; nested Radix dialogs close top-first). Keep titles, descriptions and button labels exactly.
- [ ] **Step 6: Write `tests/overlayUsage.test.ts`**: `it("no hand-rolled dialogs")`: no `<dialog` and no `role="dialog"` in `src` outside `src/components/shadcn/` (allowlist `chat/ChatDockView.tsx`: a non-modal floating panel, comment why).
- [ ] **Step 7: Run** the new tests and the 16 dialog-related test files; update assertions that relied on native `<dialog>` internals (`showModal` stubs, `open` attribute) to role/name queries. Then `npm run typecheck`, `npm test`. Expected: PASS.
- [ ] **Step 8: Browser check**: open a request panel from the board, press Esc; open it, click Done → DoneDialog, press Esc (panel stays), close panel; open the panel, then click a sidebar link (no overlay may remain), press browser Back (panel reopens); new project modal; calendar "+N more"; library item editor; manage targets; at 375px the sheet is full width.
- [ ] **Step 9: Commit** (component commit + migration commit).

### Task 14: Menus and popovers — DropdownMenu, Popover everywhere

**Files:**
- Create: `src/components/shadcn/dropdown-menu.tsx` (CLI), `tests/menus.test.tsx`
- Modify: `shell/ProfileMenuView.tsx`, `shell/NotificationBellView.tsx` (raw `radix-ui` DropdownMenu → shadcn parts), `library/LibraryRow.tsx` (hand-made `role="menu"` → DropdownMenu), `FilterBar.tsx:98` and `kpi/MonthPicker.tsx:50` (`<details>` panels → `Popover`), `ui/CollapsibleSection.tsx`, `admin/lists/ListsContent.tsx:56`, `admin/users/UsersContent.tsx:121`, `admin/users/RequestsList.tsx:57`, `kpi/project/ProjectKpiPanel.tsx:79`, `kpi/TrendChart.tsx:63` (`<details>` disclosure → `Collapsible`, add `collapsible.tsx` via CLI); tests `profileMenu`, `notificationBell`, `notificationShell`, `filterBar`, `libraryView`, `libraryEditor`, `kpiUi`, `kpiRedesign`

**Interfaces:**
- Produces: `DropdownMenu*` (content `rounded-lg border bg-popover p-1 shadow-raised`, items `rounded-md px-2.5 py-1.5 text-sm hover/focus:bg-muted disabled:opacity-55 [&_svg]:size-4 [&_svg]:text-muted-foreground`), `Collapsible*`. `Popover` from before.

- [ ] **Step 1: Add** `npx shadcn@latest add dropdown-menu collapsible`; CLI rules.
- [ ] **Step 2: Write `tests/menus.test.tsx`**:
  - `it("library row actions open a menu, arrow keys move, Esc closes and focus returns to the trigger")`.
  - `it("FilterBar's filter panel opens as a popover, Apply submits the filters, Esc closes it")` (keeps the `name`d fields inside the form: the Popover content must render inside the `<form>` — use `PopoverContent` without Portal or `forceMount` inside the form; assert `FormData` has the fields).
  - `it("MonthPicker closes on outside click and Esc")`.
  - `it("CollapsibleSection is closed by default and its trigger is the heading row")`.
- [ ] **Step 3–5: Run (FAIL), migrate, run (PASS).**
- [ ] **Step 6: Add to `tests/overlayUsage.test.ts`**: `it("no hand-rolled menus or details popovers")`: no `role="menu"`/`role="menuitem"` and no `<details` in `src` outside `src/components/shadcn/`.
- [ ] **Step 7: Run** typecheck, `npm test`. **Step 8: Browser check**: profile menu (theme toggle, sign out), bell (mark read), library row menu, FilterBar (apply, clear) at 375px and desktop, KPI month picker, admin lists disclosures. **Step 9: Commit.**

### Task 15: Remaining generic parts — Table, ToggleGroup, mobile drawer

**Files:**
- Create: `src/components/shadcn/{table,toggle-group}.tsx` (CLI), `tests/shadcnTable.test.tsx`
- Modify: 8 `ui/table.ts` importers → shadcn `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (sticky header, row hover, no zebra, `compact` density via `className`); `ui/SegmentedControl.tsx` button mode → composes `ToggleGroup` (link mode stays a `<nav>` of links with `aria-current`, styled with `buttonVariants`); `library/LibraryView.tsx:125-127` category pills → `ToggleGroup`; `shell/AppFrame.tsx` mobile drawer → `Sheet side="left"` (Task 13)
- Delete: `src/components/ui/table.ts`

- [ ] **Step 1: Add**; CLI rules.
- [ ] **Step 2: Port tests** ("sticky header, row hover, compact density", "renders a semantic table", SegmentedControl link/button modes) and add `it("mobile drawer opens from the menu button, traps focus, closes on Esc and returns focus")`.
- [ ] **Step 3–5: Run (FAIL), implement, run (PASS).**
- [ ] **Step 6: Run** `appFrame`, `shellHydration`, `sidebarDefault`, `shellNavGating`, `requestTableRedesign`, `projectsUi`, then `npm test`. Append `table` to `tests/kitRemoved.test.ts`.
- [ ] **Step 7: Browser check**: request table (sticky header while scrolling), admin tables, Board/Table switch, library categories, mobile nav at 375px in light and dark (no hydration warning in the console). **Step 8: Commit.**

### Task 16: Polish, docs and release check

**Files:**
- Modify: leftovers found by `grep -rnE 'shadow-(lg|xl)|disabled:opacity-(40|50|60)'` (outside `landing/`); `src/components/ui/README.md` (component map: statuses → *Migrated*; kit table: remove migrated rows; drop "Still here until migrated"); `docs/superpowers/specs/2026-10-14-shadcn-first-design.md` (status: done, date); `tests/shadcnCleanup.test.tsx` (fold into `tests/shadcnFolder.test.tsx` if it only repeats rules)

- [ ] **Step 1: Fix leftovers**: `shadow-lg`/`shadow-xl` → `shadow-raised`; disabled opacities per Global Constraints.
- [ ] **Step 2: Re-run the audit greps** from the spec (dialogs, menus, inline cards, sub-12px text, raw `<button>` with hand-made classes) and record the new consistency score in the spec. Expected: ≥ 34/40, every P1 closed.
- [ ] **Step 3: Update docs** as listed.
- [ ] **Step 4: Full check**: `npm run lint`, `npm run typecheck`, `npm test`, then `npx next build` with `scripts/check-login.local.ts` moved aside (`trap` restores it). Expected: all pass, test count ≥ baseline.
- [ ] **Step 5: Browser QA** of every page group in light, dark and 375px: sign-in/sign-up/verify/lobby/join, dashboard, requests (board, table, calendar, panel, new), projects (list, detail, tasks, timeline), content plan, brief calendar, library, KPI (self, team, projects), notifications, settings, admin (members, invited, requests, lists), help. Screenshot anything changed beyond the audit's intended fixes and fix or note it.
- [ ] **Step 6: Commit** `docs(ui): shadcn-first migration complete`.
- [ ] **Step 7: Ask the user** before pushing `feat/shadcn-first` and opening a PR against `feat/project-page`; after the PR exists, follow the repo's PR flow (Vercel preview build must pass) and ask the user to try the preview (create request, open panel, mark Done, filter) before merging.
