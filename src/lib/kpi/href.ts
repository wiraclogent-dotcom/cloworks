/** `action?a=1&b=2#hash` from the params that have a value; empty and undefined ones are skipped. Used by the KPI pickers. */
export function kpiHref(action: string, params: Record<string, string | undefined>, hash?: string): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, v);
  const qs = sp.toString();
  return `${action}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}
