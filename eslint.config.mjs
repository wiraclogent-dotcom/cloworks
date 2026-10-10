import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // App code reads and writes through the workspace-scoped client. The raw client is for sign-in and authentication
  // only (plus seed, scripts and test helpers, which live outside src/).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: ["@/lib/db", "./db", "../db", "../lib/db"].map((name) => ({
          name,
          importNames: ["prisma"],
          message: "Use the workspace-scoped client: requireScope() in pages, dbFor(user) in actions (from @/lib/session).",
        })),
      }],
    },
  },
  {
    files: ["src/lib/db.ts", "src/lib/signin.ts", "src/lib/passwordAuth.ts", "src/lib/session-core.ts", "src/lib/session.ts", "src/lib/auth.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
