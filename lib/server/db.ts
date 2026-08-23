import type { D1Database } from '@cloudflare/workers-types';
import { ensureSchema } from '@/db/schema';

type RuntimeEnv = { DB: D1Database };

export async function getDb() {
  const { env } = await import('cloudflare:workers');
  const db = (env as unknown as RuntimeEnv).DB;
  if (!db) throw new Error('D1 binding DB is not available');
  await ensureSchema(db);
  return db;
}
