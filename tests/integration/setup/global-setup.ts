import { sql } from "drizzle-orm";

import { runMigrations } from "@/server/db/migrate";

import { createTestDb } from "../helpers/test-db";

/** Rebuilds the test database from the committed migrations once per run. */
export default async function globalSetup() {
  const { db, pool } = createTestDb();
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
