import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from './client';
import { applyBlocks } from './blocks-sql';
import { tehranParts, tehranWallToUtc } from '../lib/i18n/jalali';

/** Same daily pattern as the demo seed (Tehran wall-clock). */
const STARTS: [number, number][] = [[16, 0], [17, 30], [19, 0], [20, 30], [22, 0]];

/**
 * Keeps the DEMO data alive: the seed only creates 10 days of slots, so a demo database "runs dry" ("no free slots for this
 * day") after that. This adds the missing slots for the next `days` days for every published venue, using the venue's own
 * price / slot length. It is idempotent (existing slots are never touched or duplicated) and never deletes anything.
 * Real deployments do NOT call it (owners create their own slots); it is opt-in via `npm run db:slots` or DEMO_AUTO_SLOTS=1.
 */
export async function extendDemoSlots(days = 14): Promise<number> {
  const d = db();
  const rows = await d.select({ venueId: schema.venueSports.venueId, sportId: schema.venueSports.sportId, price: schema.venueSports.pricePerSlot, minutes: schema.venueSports.slotMinutes })
    .from(schema.venueSports).innerJoin(schema.venues, eq(schema.venues.id, schema.venueSports.venueId))
    .where(and(eq(schema.venues.status, 'published'))).orderBy(asc(schema.venueSports.venueId), asc(schema.venueSports.sportId));
  const byVenue = new Map<string, typeof rows>();
  for (const r of rows) byVenue.set(r.venueId, [...(byVenue.get(r.venueId) ?? []), r]);

  const t0 = tehranParts(new Date());
  const now = Date.now();
  const values: (typeof schema.timeSlots.$inferInsert)[] = [];
  for (const [venueId, sports] of byVenue) {
    for (let day = 0; day < days; day++) {
      const base = new Date(Date.UTC(t0.y, t0.m - 1, t0.d + day));
      for (const [i, [h, m]] of STARTS.entries()) {
        const startsAt = tehranWallToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, m);
        if (startsAt.getTime() < now) continue;
        const s = sports[(i + day) % sports.length];
        values.push({ venueId, sportId: s.sportId, startsAt, endsAt: new Date(startsAt.getTime() + s.minutes * 60_000), price: s.price + (h >= 19 ? 30000 : 0) });
      }
    }
  }
  let added = 0;
  for (let i = 0; i < values.length; i += 500) {
    const res = await d.insert(schema.timeSlots).values(values.slice(i, i + 500)).onConflictDoNothing().returning({ id: schema.timeSlots.id });
    added += res.length;
  }
  for (const venueId of byVenue.keys()) await applyBlocks(d, venueId); // keep standing reservations closed
  return added;
}
