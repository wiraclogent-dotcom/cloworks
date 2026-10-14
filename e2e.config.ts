import { existsSync } from "node:fs";
import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { anthropic } from "@ai-sdk/anthropic";

// e2e loads no .env itself; every worker re-imports this file, so load it here. Local runs sign in with the
// LOCAL_QA_EMAIL / LOCAL_QA_PASSWORD account (localhost only, never a deployed URL).
if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.APP_URL ?? "http://localhost:3000";
const app = {
  url,
  // Reuses the dev server when it already runs (start Postgres first: `npm run db:dev`).
  command: { executable: "npm", args: ["run", "dev"], reuseExisting: true, log: ".e2e/logs/app.log" },
};

const qaEmail = process.env.LOCAL_QA_EMAIL;
const qaPassword = process.env.LOCAL_QA_PASSWORD;

export default {
  tests: "tests/e2e/**/*.e2e.ts",
  // Desktop size; phone checks set their own viewport (tests/e2e/smoke/mobile-nav.e2e.ts).
  targets: [{ name: "desktop", engine: web({ viewport: { width: 1440, height: 900 } }), app }],
  // Agent steps (tests/e2e/agent) need a model: an Anthropic API key, e.g. from a Claude Max/Team plan's API credits.
  ...(process.env.ANTHROPIC_API_KEY ? { agents: { default: { model: anthropic("claude-sonnet-5-5") } } } : {}),
  ...(qaEmail && qaPassword ? { credentials: { qa: { username: qaEmail, password: qaPassword } } } : {}),
} satisfies E2EConfig;
