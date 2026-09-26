import { createDb } from "../src/server/db/client";
import { resetDemoData } from "../src/server/db/demo-seed";
import { describeDatabase, loadLocalEnv, requireEnv } from "./load-env";

async function main() {
  loadLocalEnv();
  const url = requireEnv("DATABASE_URL");

  const { db, pool } = createDb(url, { max: 1 });
  console.log(`Resetting demo data in ${describeDatabase(url)} (only demo-owned rows) ...`);
  try {
    const summary = await resetDemoData(db);
    console.table(summary);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
