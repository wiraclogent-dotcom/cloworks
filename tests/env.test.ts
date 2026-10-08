import { describe, it, expect } from "vitest";
import { validateEnv, shouldValidateEnv } from "@/lib/env";

const GOOD = {
  DATABASE_URL: "postgresql://u:p@db:5432/x", AUTH_SECRET: "a-real-looking-secret-0123456789abcdef", AUTH_URL: "https://tracker.example.com",
  AUTH_GOOGLE_ID: "gid", AUTH_GOOGLE_SECRET: "gsecret", RESEND_API_KEY: "re_x", EMAIL_FROM: "T <n@x.com>", APP_BASE_URL: "https://tracker.example.com",
};

describe("validateEnv", () => {
  it("is clean for a complete Google-only setup", () => {
    expect(validateEnv(GOOD)).toEqual({ errors: [], warnings: [] });
  });
  it("reports every missing required variable, and an empty environment is all errors", () => {
    const r = validateEnv({});
    expect(r.errors.length).toBe(4);
    expect(r.errors.join(" ")).toMatch(/DATABASE_URL[\s\S]*AUTH_SECRET[\s\S]*AUTH_URL[\s\S]*provider/);
    expect(r.warnings).toHaveLength(2);
  });
  it("rejects a placeholder or short AUTH_SECRET", () => {
    expect(validateEnv({ ...GOOD, AUTH_SECRET: "change-me-generate-with-openssl-rand-base64-32" }).errors.join()).toMatch(/placeholder/);
    expect(validateEnv({ ...GOOD, AUTH_SECRET: "short" }).errors.join()).toMatch(/16/);
  });
  it("needs a provider, its secret, and the tenant id for Entra", () => {
    expect(validateEnv({ ...GOOD, AUTH_GOOGLE_ID: undefined, AUTH_GOOGLE_SECRET: undefined }).errors.join()).toMatch(/provider/);
    expect(validateEnv({ ...GOOD, AUTH_GOOGLE_SECRET: "" }).errors.join()).toMatch(/AUTH_GOOGLE_SECRET/);
    const entra = { ...GOOD, AUTH_GOOGLE_ID: undefined, AUTH_GOOGLE_SECRET: undefined, AUTH_MICROSOFT_ENTRA_ID_ID: "eid", AUTH_MICROSOFT_ENTRA_ID_SECRET: "es" };
    expect(validateEnv(entra).errors.join()).toMatch(/TENANT_ID/);
    expect(validateEnv({ ...entra, AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: "t" }).errors).toEqual([]);
  });
  it("only warns (never errors) for missing email settings", () => {
    const r = validateEnv({ ...GOOD, RESEND_API_KEY: undefined, EMAIL_FROM: undefined, APP_BASE_URL: undefined });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/no email notifications/);
  });
  it("never includes secret values in messages", () => {
    const text = JSON.stringify(validateEnv({ ...GOOD, AUTH_SECRET: "short-secret-xyz", DATABASE_URL: "" }));
    expect(text).not.toContain("short-secret-xyz");
    expect(text).not.toContain("gsecret");
  });
});

describe("shouldValidateEnv", () => {
  it("runs only on the production node runtime outside the build", () => {
    expect(shouldValidateEnv({ NEXT_RUNTIME: "nodejs", NODE_ENV: "production" })).toBe(true);
    expect(shouldValidateEnv({ NEXT_RUNTIME: "nodejs", NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBe(false);
    expect(shouldValidateEnv({ NEXT_RUNTIME: "edge", NODE_ENV: "production" })).toBe(false);
    expect(shouldValidateEnv({ NEXT_RUNTIME: "nodejs", NODE_ENV: "development" })).toBe(false);
    expect(shouldValidateEnv({})).toBe(false);
  });
});
