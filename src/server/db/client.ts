import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema";

/**
 * Creates a Drizzle client over a pg Pool. Used by the app singleton (`./index`),
 * scripts and integration tests, so it must not import anything Next.js-specific.
 */
export function createDb(connectionString: string, poolConfig: PoolConfig = {}) {
  const pool = new Pool({ connectionString, max: 5, ...poolConfig });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];
/** A transaction handle; services accept `Db | Tx` so they compose inside transactions. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
