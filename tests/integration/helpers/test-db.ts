import { existsSync } from "node:fs";

import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import { createDb, type Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

function normalise(url: string | undefined) {
  if (!url) return undefined;
  const { host, pathname } = new URL(url);
  // Pooled and direct Neon hosts differ only by the "-pooler" suffix.
  return `${host.replace("-pooler", "")}${pathname}`;
}

/**
 * Integration tests wipe the database, so they need a dedicated TEST_DATABASE_URL
 * and refuse to run against the app's own database.
 */
export function getTestDatabaseUrl(): string {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a disposable database (see .env.example).",
    );
  }
  const target = normalise(url);
  for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
    if (target === normalise(process.env[name])) {
      throw new Error(
        `TEST_DATABASE_URL points at the same database as ${name}. Refusing to wipe it.`,
      );
    }
  }
  return url;
}

const tableNames = Object.values(schema as Record<string, unknown>)
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`);

export async function truncateAll(db: Db) {
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableNames.join(", ")} CASCADE`));
}

export function createTestDb() {
  return createDb(getTestDatabaseUrl(), { max: 2 });
}

/** Asserts that a query failed with one of the given Postgres error codes (e.g. 23505). */
export async function expectPgError(promise: Promise<unknown>, codes: string | readonly string[]) {
  const expected = typeof codes === "string" ? [codes] : codes;
  let error: unknown;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  if (!error) {
    throw new Error(`Expected Postgres error ${expected.join("/")}, but the query succeeded`);
  }
  const pgCode =
    (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  if (!pgCode || !expected.includes(pgCode)) {
    throw new Error(
      `Expected Postgres error ${expected.join("/")}, got ${pgCode ?? "none"}: ${String(error)}`,
    );
  }
}
