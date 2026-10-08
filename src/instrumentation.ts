import { shouldValidateEnv, validateEnv } from "@/lib/env";

/** Fails a bad production deploy at boot (not on the first request). Skipped during `next build` and in dev. */
export function register() {
  if (!shouldValidateEnv()) return;
  const { errors, warnings } = validateEnv();
  for (const w of warnings) console.warn(`[env] ${w}`);
  if (errors.length) throw new Error(`Invalid environment:\n- ${errors.join("\n- ")}`);
}
