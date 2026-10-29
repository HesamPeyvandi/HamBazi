import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { E } from '@/server/booking/errors';

/** Only published venues can be saved. Idempotent both ways. */
export async function setFavorite(userId: string, venueId: string, on: boolean) {
  if (on) {
    const [v] = await db().select({ id: schema.venues.id }).from(schema.venues).where(and(eq(schema.venues.id, venueId), eq(schema.venues.status, 'published')));
    if (!v) throw E.notFound();
    await db().insert(schema.favoriteVenues).values({ userId, venueId }).onConflictDoNothing();
  } else {
    await db().delete(schema.favoriteVenues).where(and(eq(schema.favoriteVenues.userId, userId), eq(schema.favoriteVenues.venueId, venueId)));
  }
}
export async function favoriteIds(userId: string): Promise<Set<string>> {
  const rows = await db().select({ id: schema.favoriteVenues.venueId }).from(schema.favoriteVenues).where(eq(schema.favoriteVenues.userId, userId));
  return new Set(rows.map((r) => r.id));
}
/** Saved venues, newest first. Venues that were suspended/unpublished disappear from the list (the row is kept). */
export async function listFavoriteVenueIds(userId: string): Promise<string[]> {
  const rows = await db().select({ id: schema.favoriteVenues.venueId }).from(schema.favoriteVenues)
    .innerJoin(schema.venues, and(eq(schema.venues.id, schema.favoriteVenues.venueId), eq(schema.venues.status, 'published')))
    .where(eq(schema.favoriteVenues.userId, userId)).orderBy(desc(schema.favoriteVenues.createdAt));
  return rows.map((r) => r.id);
}
