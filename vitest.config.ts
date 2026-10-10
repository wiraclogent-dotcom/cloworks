import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    testTimeout: 60000,
    hookTimeout: 120000,
    // next-auth imports "next/server" without an extension; inlining lets Vite resolve it (tests/signinE2E.test.ts).
    server: { deps: { inline: ["next-auth"] } },
  },
});
