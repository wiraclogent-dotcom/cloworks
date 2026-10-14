<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI: shadcn first

Before building or changing UI, read `src/components/ui/README.md`. Use a shadcn/ui component from
`src/components/shadcn/` first (add missing ones with `npx shadcn@latest add <name>` and restyle them with our
tokens), a kit component from `src/components/ui/` only when shadcn has none, and add a new documented kit component
only when neither exists. Tokens follow the same order: shadcn names (`bg-card`, `bg-muted`, `text-muted-foreground`…)
first, extension tokens (`text-heading`, `text-link`, `text-danger`, `data-tone`…) only for roles shadcn lacks.
