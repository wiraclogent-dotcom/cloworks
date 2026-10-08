import { PrismaClient } from "@prisma/client";
import { parseArgs } from "../src/lib/import/cliArgs";
import { runImport } from "../src/lib/import/run";

// Dry-run by default; --apply writes. Never fetches URLs; reads a local .xlsx workbook (or legacy CSV exports) only.
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new PrismaClient();
  try {
    await runImport(db, args);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
