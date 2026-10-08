export type CsvArgs = { requestsPath: string; socmedPath: string | undefined; apply: boolean };
export type WorkbookArgs = { workbookPath: string; apply: boolean };
export type CliArgs = CsvArgs | WorkbookArgs;

export const isWorkbookArgs = (a: CliArgs): a is WorkbookArgs => "workbookPath" in a;
const isXlsx = (p: string) => p.toLowerCase().endsWith(".xlsx");

const USAGE = "Usage: npm run import:sheet -- <master.xlsx> [--apply]   or   -- <requests.csv> [socmed.csv] [--apply]";

/**
 * Pure argument handling for scripts/import-sheet.ts. Dry-run unless --apply is given.
 * Mode is chosen by the first file argument's extension: .xlsx = workbook mode, otherwise legacy CSV mode.
 */
export function parseArgs(argv: string[]): CliArgs {
  const files: string[] = [];
  let apply = false;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    else if (a.startsWith("--")) throw new Error(`Unknown option: ${a}`);
    else files.push(a);
  }
  if (files.length === 0) throw new Error(`${USAGE}  (requests.csv is required)`);
  if (isXlsx(files[0])) {
    if (files.length > 1) throw new Error("Workbook mode takes exactly one file (the master .xlsx); it reads all three tabs itself.");
    return { workbookPath: files[0], apply };
  }
  if (files.some(isXlsx)) throw new Error("The .xlsx workbook must be the only file argument (use either <master.xlsx> or the CSV files).");
  if (files.length > 2) throw new Error("Too many file arguments (expected <requests.csv> [socmed.csv])");
  return { requestsPath: files[0], socmedPath: files[1], apply };
}
