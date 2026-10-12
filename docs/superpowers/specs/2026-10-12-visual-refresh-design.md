# Visual refresh — "Playful pro"

Date: 2026-10-12 · Branch: `feat/visual-refresh`

## Goal

Make Cloworks feel alive, attractive, professional and fun — landing first, then every page —
without changing behaviour and without making anything load slower.

**Direction (chosen): Playful pro.** A clean, professional base (keep Deep Blue `#09426d` + Aqua
`#11aa9f`, the warm surface, the existing kit) with friendly soft-3D "clay" illustrations, bouncy
micro-interactions and small celebratory moments. Fun lives in art and motion; layout and data
stay calm and readable. No mascot.

## Non-goals

- No rebrand, no new palette, no behaviour/data changes.
- No JS animation library (no framer-motion, no Lottie runtime).
- Not consolidating the shadcn/custom-kit split (separate task).

## Performance budget

- Zero new runtime dependencies. Motion = CSS + React 19.3 `<ViewTransition>` (built in).
- All art served from Cloudinary with `f_auto,q_auto` + width-specific `srcset`; decorative art
  `loading="lazy"` except the landing hero (`fetchpriority="high"`). Hero art ≤ ~120 KB at 1x.
- Animated assets are CSS-animated stills (float/parallax/tilt), not video. Any looping clip, if
  ever added, is muted, lazy, has a poster, and is skipped under reduced motion.
- `prefers-reduced-motion: reduce` disables every non-essential animation.

## 1. Foundation

- **Typography:** load Bricolage Grotesque once in the root layout as `--font-display`; use it for
  page titles (`PageHeader`), KPI numbers, empty-state titles and marketing headings. Removes the
  two duplicate loaders (landing, AuthShell) and the copy-pasted `display` class.
- **Motion tokens** in `globals.css`: `--ease-spring`, `--ease-out`, `--dur-1/2/3`; utilities
  `animate-rise` (fade+lift on mount), `animate-pop`, `animate-float`, `reveal` (scroll-driven via
  `animation-timeline: view()`, static fallback), hover-lift for cards/buttons, press-scale.
- **Route transitions:** `<ViewTransition>` around the app content area (subtle crossfade + 8px
  rise) and around Suspense fallbacks (skeleton → content slide-up). Sidebar stays put.
- **Celebration:** a CSS-only confetti burst (`<Celebrate>` client component, ~1 KB) when a request
  moves to Done or a KPI target is hit.

## 2. Asset pipeline (Magnific → Cloudinary)

- Generate a consistent illustration set in Magnific: soft 3D clay, Deep Blue/Aqua/warm-cream
  palette, transparent or cream background. Set (≈14 images):
  hero scene, 3 "how it works" steps, 3 team roles (requester/lead/designer), auth panel art,
  empty states (no requests, no projects, library, content plan, notifications, search/no results),
  404, success/done.
- `scripts/upload-brand-assets.local.mts` uploads each by remote URL to Cloudinary at fixed public
  IDs `cloworks/brand/<name>` (idempotent overwrite).
- `src/lib/brand/art.ts`: typed manifest (`name → publicId, width, height, alt`).
- `src/components/ui/BrandArt.tsx`: server component → `<img>` with Cloudinary `srcset`
  (`w_320…1600`, `f_auto,q_auto`), explicit width/height (no layout shift). Renders nothing if
  `CLOUDINARY_CLOUD_NAME` is unset (art is decorative).

## 3. Landing (`src/components/landing/*`)

- Hero: keep the headline + animated HeroBoard; add the clay hero scene with floating parallax
  pieces, animated gradient mesh behind it, staggered `animate-rise` entrance.
- Showcase: hover tilt + scroll reveal; How it works / Teams use the new art; features get
  hover-lift icon tiles; CTA band gets a soft animated gradient. Fix "Ask Wira" hard-coded copy.

## 4. Auth pages (`AuthShell`)

Replace reused landing photos with dedicated auth art, floating animation, shared display font.

## 5. App pages

- `EmptyState` gains an optional `art` prop → every empty state gets an illustration.
- PageHeader uses display font + `animate-rise`; Cards/BoardCards hover-lift; KPI numbers count up
  (CSS `@property` counter) and progress bars animate in; Done → confetti.
- 404/error pages get art. Welcome card keeps its sky illustration.

## Testing

- Existing vitest suite stays green; unit test for `BrandArt` URL/srcset builder.
- `next build` passes; preview each page in light + dark + mobile; Lighthouse on landing
  (LCP not worse than before).
