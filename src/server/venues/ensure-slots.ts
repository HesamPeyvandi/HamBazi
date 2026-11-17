import { env } from '@/server/env';
import { ensureSlots } from '@/db/slot-generator';

const THROTTLE_MS = 5 * 60_000;
const last = new Map<string, number>();
const inflight = new Map<string, Promise<void>>();

/**
 * Keeps the rolling window of slots filled from the venues' weekly schedules (and, in demo/dev only, gives venues without one the
 * demo default). Called lazily from public pages and from the daily cron; throttled per instance and never throws (a failure here
 * must not break a page — it only means the next call retries).
 */
export async function ensureSlotsFresh(venueId: string | null = null): Promise<void> {
  if (process.env.NODE_ENV === 'test') return; // unit tests build their own fixtures
  const key = venueId ?? '*';
  if (Date.now() - (last.get(key) ?? 0) < THROTTLE_MS) return;
  const running = inflight.get(key);
  if (running) return running;
  const p = ensureSlots(venueId, { demoDefaults: env().isDemoLike })
    .then(() => { last.set(key, Date.now()); })
    .catch((e) => { console.error('[ensureSlotsFresh]', e instanceof Error ? e.message : e); })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}
