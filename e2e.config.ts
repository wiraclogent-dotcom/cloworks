import { existsSync } from "node:fs";
import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";

// e2e loads no .env itself; every worker re-imports this file, so load it here.
if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.APP_URL ?? "http://localhost:3000";
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/.test(url);

const app = isLocal
  ? {
      url,
      // Reuses the dev server when it already runs (start Postgres first: `npm run db:dev`). A server e2e starts itself
      // never sends email: empty RESEND_API_KEY/EMAIL_FROM win over .env (tests/e2e/flows writes requests).
      command: {
        executable: "npm", args: ["run", "dev"], reuseExisting: true, log: ".e2e/logs/app.log",
        env: { RESEND_API_KEY: "", EMAIL_FROM: "" },
      },
    }
  // A deployed preview: nothing to start; a stable identity keeps the replay cache valid across preview URLs.
  : { url, identity: "cloworks" };

// Vercel Deployment Protection: send the "Protection Bypass for Automation" secret (only to the preview's own site).
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const engine = web({
  viewport: { width: 1440, height: 900 },
  ...(!isLocal && bypass ? { headers: { "x-vercel-protection-bypass": bypass } } : {}),
});

// Agent steps (tests/e2e/agent) need a model: the Anthropic API (ANTHROPIC_API_KEY) first, else the Command Code
// Provider API (CMD_API_KEY, Provider plan or higher; Anthropic-style /v1/messages with a Bearer token).
// A user key (sk-ant-usr-…) isn't scoped to a workspace: set ANTHROPIC_WORKSPACE_ID to send the required header.
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
const model = process.env.ANTHROPIC_API_KEY
  ? (workspaceId ? createAnthropic({ headers: { "anthropic-workspace-id": workspaceId } }) : anthropic)("claude-fable-5-1")
  : process.env.CMD_API_KEY
    ? createAnthropic({ baseURL: "https://api.commandcode.ai/provider/v1", authToken: process.env.CMD_API_KEY })("claude-fable-5-1")
    : undefined;

// The "qa" account: LOCAL_QA_* on localhost only, PREVIEW_* (typed in by scripts/e2e-preview.sh, never stored) on a
// deployed URL — local test credentials are never sent to a deployed site.
const qaEmail = isLocal ? process.env.LOCAL_QA_EMAIL : process.env.PREVIEW_EMAIL;
const qaPassword = isLocal ? process.env.LOCAL_QA_PASSWORD : process.env.PREVIEW_PASSWORD;

export default {
  tests: "tests/e2e/**/*.e2e.ts",
  // Desktop size; phone checks set their own viewport (tests/e2e/smoke/mobile-nav.e2e.ts).
  targets: [{ name: isLocal ? "desktop" : "preview", engine, app }],
  ...(model ? { agents: { default: { model } } } : {}),
  ...(qaEmail && qaPassword ? { credentials: { qa: { username: qaEmail, password: qaPassword } } } : {}),
} satisfies E2EConfig;
