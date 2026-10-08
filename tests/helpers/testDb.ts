import EmbeddedPostgres from "embedded-postgres";
import { PrismaClient } from "@prisma/client";
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
  prisma: PrismaClient;
  stop(): Promise<void>;
}

/** Starts a throwaway embedded Postgres, applies the Prisma schema, returns a connected client. */
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

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();

  return {
    url,
    prisma,
    async stop() {
      await prisma.$disconnect();
      await pg.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
