import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.env.PGPORT ?? 54329);
const dataDir = path.resolve(".pgdata");
const dbName = "creative_tracker";

async function main() {
  const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    onLog: () => {},
    onError: (e) => console.error(e),
  });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(dbName);
  console.log(`Embedded Postgres running (data: .pgdata/). Press Ctrl+C to stop.`);
  console.log(`DATABASE_URL="postgresql://postgres:postgres@localhost:${port}/${dbName}"`);
  const shutdown = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
