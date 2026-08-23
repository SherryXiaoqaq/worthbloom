import type { D1Database } from '@cloudflare/workers-types';
import { ensureSchema } from '@/db/schema';

type RuntimeEnv = { DB: D1Database };

export async function getDb() {
  // Keep the legacy Sites/D1 adapter available without asking the standard
  // Next.js bundle used by CloudBase Run to resolve a Cloudflare-only module.
  const cloudflareRuntime = 'cloudflare:workers';
  const { env } = await import(/* webpackIgnore: true */ cloudflareRuntime);
  const db = (env as unknown as RuntimeEnv).DB;
  if (!db) throw new Error('D1 binding DB is not available');
  await ensureSchema(db);
  return db;
}
