import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // serverless-friendly: small pool, prepare:false for PgBouncer (Neon pooled endpoint)
  return postgres(url, { max: process.env.NODE_ENV === 'production' ? 3 : 10, prepare: false, idle_timeout: 20 });
}

export function sqlClient() {
  return (g.__sql ??= connect());
}
export function db() {
  return drizzle(sqlClient(), { schema });
}
export type Db = ReturnType<typeof db>;
export { schema };
