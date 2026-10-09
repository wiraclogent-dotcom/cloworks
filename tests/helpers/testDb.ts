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
  stop(): Promise<void>;
}

/**
 * Starts a throwaway embedded Postgres, applies the Prisma migrations (which create the Clogent workspace) and
 * returns a raw client plus a client scoped to Clogent.
 */
export async function createTestDb(): Promise<TestDb> {
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

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  const raw = new PrismaClient({ datasources: { db: { url } } });
  await raw.$connect();

  return {
    url,
    prisma: makeScoped(raw, CLOGENT_WORKSPACE_ID),
    raw,
    workspaceId: CLOGENT_WORKSPACE_ID,
    async stop() {
      await raw.$disconnect();
      await pg.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
