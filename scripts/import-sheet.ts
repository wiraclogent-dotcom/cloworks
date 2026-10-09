import { parseArgs } from "../src/lib/import/cliArgs";
import { runImport } from "../src/lib/import/run";
import { resolveWorkspace, withoutWorkspaceArg } from "./lib/workspaceArg";

// Dry-run by default; --apply writes. Never fetches URLs; reads a local .xlsx workbook (or legacy CSV exports) only.
async function main() {
  const args = parseArgs(withoutWorkspaceArg(process.argv.slice(2)));
  const ws = await resolveWorkspace();
  try {
    await runImport(ws.db, ws.id, args);
  } finally {
    await ws.disconnect();
  }
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
