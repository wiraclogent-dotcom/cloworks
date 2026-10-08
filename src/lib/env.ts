type Env = Record<string, string | undefined>;
export type EnvReport = { errors: string[]; warnings: string[] };

const set = (v: string | undefined) => !!v && v.trim() !== "";

/**
 * Checks the environment a production server needs. Returns messages only; values are NEVER included, so the
 * result is safe to log. Errors mean the deploy cannot work; warnings mean a feature is off.
 */
export function validateEnv(env: Env = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!set(env.DATABASE_URL)) errors.push("DATABASE_URL is not set.");

  const secret = env.AUTH_SECRET?.trim();
  if (!secret) errors.push("AUTH_SECRET is not set.");
  else if (secret.startsWith("change-me")) errors.push("AUTH_SECRET is still the placeholder from .env.example.");
  else if (secret.length < 16) errors.push("AUTH_SECRET must be at least 16 characters.");

  if (!set(env.AUTH_URL)) errors.push("AUTH_URL is not set (the public base URL of the app).");

  const google = set(env.AUTH_GOOGLE_ID);
  const entra = set(env.AUTH_MICROSOFT_ENTRA_ID_ID);
  if (!google && !entra) errors.push("No sign-in provider is configured: set AUTH_GOOGLE_ID or AUTH_MICROSOFT_ENTRA_ID_ID (with their secrets).");
  if (google && !set(env.AUTH_GOOGLE_SECRET)) errors.push("AUTH_GOOGLE_ID is set but AUTH_GOOGLE_SECRET is missing.");
  if (entra) {
    if (!set(env.AUTH_MICROSOFT_ENTRA_ID_SECRET)) errors.push("AUTH_MICROSOFT_ENTRA_ID_ID is set but AUTH_MICROSOFT_ENTRA_ID_SECRET is missing.");
    if (!set(env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID)) errors.push("AUTH_MICROSOFT_ENTRA_ID_ID is set but AUTH_MICROSOFT_ENTRA_ID_TENANT_ID is missing (Entra sign-in would be denied for everyone).");
  }

  if (!set(env.RESEND_API_KEY) || !set(env.EMAIL_FROM)) warnings.push("RESEND_API_KEY and/or EMAIL_FROM is not set: no email notifications will be sent.");
  if (!set(env.APP_BASE_URL)) warnings.push("APP_BASE_URL is not set: links in notification emails will be missing.");
  return { errors, warnings };
}

/** Whether startup validation should run: real production server runtime, not the build. */
export function shouldValidateEnv(env: Env = process.env): boolean {
  return env.NEXT_RUNTIME === "nodejs" && env.NEXT_PHASE !== "phase-production-build" && env.NODE_ENV === "production";
}
