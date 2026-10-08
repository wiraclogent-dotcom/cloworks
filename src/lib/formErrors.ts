/**
 * One polite announcement for a failed submit, e.g. "2 problems: Title is required; Deadline: Cannot be in the past".
 * `labelOf` turns a field key into the label people see; the label is skipped when the message already starts with it.
 */
export function errorSummary(errors: Record<string, string>, labelOf: (key: string) => string): string {
  const parts = Object.entries(errors).map(([k, m]) => {
    const label = labelOf(k);
    return label && !m.toLowerCase().startsWith(label.toLowerCase()) ? `${label}: ${m}` : m;
  });
  if (parts.length === 0) return "";
  return `${parts.length} ${parts.length === 1 ? "problem" : "problems"}: ${parts.join("; ")}`;
}
