import { eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { shareLinks } from "../../src/server/db/schema";

export * from "../../src/server/db/schema";

export type Statement = { sql: string; params: unknown[] };

// Builds SQL only; the callback never runs because no query is executed.
const builder = drizzle(async () => ({ rows: [] }));

/** An INSERT checked against the Drizzle schema, with bound parameters. */
export const insertRow = <T extends SQLiteTable>(table: T, values: T["$inferInsert"]): Statement =>
  builder.insert(table).values(values).toSQL();

export const insertRowIfMissing = <T extends SQLiteTable>(
  table: T,
  values: T["$inferInsert"],
): Statement => builder.insert(table).values(values).onConflictDoNothing().toSQL();

export const shareTokenQuery = (videoId: string): Statement =>
  builder
    .select({ token: shareLinks.token })
    .from(shareLinks)
    .where(eq(shareLinks.videoId, videoId))
    .toSQL();
