import "server-only";

import { env } from "@/lib/env";

import { createDb, type Db } from "./client";

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { rubriciqDb?: Db };

export const db: Db = globalForDb.rubriciqDb ?? createDb(env.DATABASE_URL).db;

if (env.NODE_ENV !== "production") {
  globalForDb.rubriciqDb = db;
}

export type { Db, DbOrTx, Tx } from "./client";
