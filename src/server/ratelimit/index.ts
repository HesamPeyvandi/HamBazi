import { sqlClient } from '@/db/client';

/**
 * Fixed-window counter in Postgres (atomic upsert). Returns whether the hit is allowed.
 * Works on serverless without extra infrastructure.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }> {
  const sql = sqlClient();
  const rows = await sql<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`;
  const count = rows[0].count;
  return { allowed: count <= limit, count };
}
