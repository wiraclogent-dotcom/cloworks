import { prisma, scopedDb } from "../../src/lib/db";

/** Resolves `--workspace <slug>` (default "clogent") to a workspace id and a client scoped to it. */
export async function resolveWorkspace(argv: string[] = process.argv) {
  const i = argv.indexOf("--workspace");
  const slug = i >= 0 ? argv[i + 1] : "clogent";
  if (!slug || slug.startsWith("--")) throw new Error("--workspace needs a slug.");
  const ws = await prisma.workspace.findUnique({ where: { slug } });
  if (!ws) throw new Error(`Unknown workspace "${slug}".`);
  console.log(`Workspace: ${ws.name} (${ws.slug})`);
  return { id: ws.id, db: scopedDb(ws.id), disconnect: () => prisma.$disconnect() };
}

/** argv without `--workspace <slug>`, for scripts whose own parser rejects unknown options. */
export function withoutWorkspaceArg(argv: string[]): string[] {
  const i = argv.indexOf("--workspace");
  return i < 0 ? argv : [...argv.slice(0, i), ...argv.slice(i + 2)];
}
