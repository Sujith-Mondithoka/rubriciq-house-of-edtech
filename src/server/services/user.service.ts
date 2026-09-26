import { eq } from "drizzle-orm";

import type { DbOrTx } from "@/server/db/client";
import { user } from "@/server/db/schema";

export async function getUserName(db: DbOrTx, userId: string): Promise<string | null> {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.name ?? null;
}
