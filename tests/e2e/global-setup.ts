import { existsSync } from "node:fs";

import { createDb } from "@/server/db/client";
import { resetDemoData } from "@/server/db/demo-seed";

/**
 * Starts every run from the seeded demo data. Only rows owned by the demo users are touched,
 * so this also clears the courses earlier runs created (they are owned by the demo instructor).
 */
export default async function globalSetup() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set; E2E tests need a seeded database.");
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await resetDemoData(db);
  } finally {
    await pool.end();
  }
}
