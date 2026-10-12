import EmbeddedPostgres from "embedded-postgres";
import { PrismaClient } from "@prisma/client";
import { CLOGENT_WORKSPACE_ID, makeScoped, type ScopedDb } from "@/lib/db";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export interface TestDb {
  url: string;
  /** Scoped to the Clogent workspace (inserted by the migrations). */
  prisma: ScopedDb;
  /** Unscoped: sees and writes every workspace. */
  raw: PrismaClient;
  workspaceId: typeof CLOGENT_WORKSPACE_ID;
  /** Applies every migration not yet applied (for tests that started with `upTo`). */
  migrate(): Promise<void>;
  stop(): Promise<void>;
}

const PRISMA_DIR = path.join(process.cwd(), "prisma");

/**
 * Runs `prisma migrate deploy`. With `upTo`, only the migration folders up to and including that one are applied
 * (copied with the schema into a temp dir, since deploy has no "stop after" flag).
 */
function deploy(url: string, upTo?: string) {
  const args = ["prisma", "migrate", "deploy"];
  let tmp: string | null = null;
  if (upTo) {
    const src = path.join(PRISMA_DIR, "migrations");
    const all = fs.readdirSync(src).filter((d) => fs.statSync(path.join(src, d)).isDirectory()).sort();
    if (!all.includes(upTo)) throw new Error(`createTestDb: unknown migration ${upTo}`);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crt-mig-"));
    fs.copyFileSync(path.join(PRISMA_DIR, "schema.prisma"), path.join(tmp, "schema.prisma"));
    fs.mkdirSync(path.join(tmp, "migrations"));
    fs.copyFileSync(path.join(src, "migration_lock.toml"), path.join(tmp, "migrations", "migration_lock.toml"));
    for (const d of all.filter((d) => d <= upTo)) fs.cpSync(path.join(src, d), path.join(tmp, "migrations", d), { recursive: true });
    args.push("--schema", path.join(tmp, "schema.prisma"));
  }
  try {
    execFileSync("npx", args, { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Starts a throwaway embedded Postgres, applies the Prisma migrations (which create the Clogent workspace) and
 * returns a raw client plus a client scoped to Clogent. `upTo` stops after the named migration folder.
 */
export async function createTestDb(opts: { upTo?: string } = {}): Promise<TestDb> {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crt-pg-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("test");
  const url = `postgresql://postgres:postgres@localhost:${port}/test`;

  deploy(url, opts.upTo);

  const raw = new PrismaClient({ datasources: { db: { url } } });
  await raw.$connect();

  return {
    url,
    prisma: makeScoped(raw, CLOGENT_WORKSPACE_ID),
    raw,
    workspaceId: CLOGENT_WORKSPACE_ID,
    async migrate() {
      deploy(url);
    },
    async stop() {
      await raw.$disconnect();
      await pg.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
