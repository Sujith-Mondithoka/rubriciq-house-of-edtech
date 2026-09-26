import { createDb } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";
import { describeDatabase, loadLocalEnv, requireEnv } from "./load-env";

async function main() {
  loadLocalEnv();
  const url = process.env.DATABASE_URL_UNPOOLED ?? requireEnv("DATABASE_URL");

  const { db, pool } = createDb(url, { max: 1 });
  console.log(`Applying migrations to ${describeDatabase(url)} ...`);
  try {
    await runMigrations(db);
    console.log("Migrations are up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
