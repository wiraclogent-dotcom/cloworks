export type CliArgs = { requestsPath: string; socmedPath: string | undefined; apply: boolean };

/** Pure argument handling for scripts/import-sheet.ts. Dry-run unless --apply is given. */
export function parseArgs(argv: string[]): CliArgs {
  const files: string[] = [];
  let apply = false;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    else if (a.startsWith("--")) throw new Error(`Unknown option: ${a}`);
    else files.push(a);
  }
  if (files.length === 0) throw new Error("Usage: npm run import:sheet -- <requests.csv> [socmed.csv] [--apply]  (requests.csv is required)");
  if (files.length > 2) throw new Error("Too many file arguments (expected <requests.csv> [socmed.csv])");
  return { requestsPath: files[0], socmedPath: files[1], apply };
}
