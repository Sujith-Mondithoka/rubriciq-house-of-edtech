import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { Db } from "./client";

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "src", "server", "db", "migrations");

/** Applies all pending migrations. Safe to run repeatedly. */
export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
