import type { MetadataRoute } from 'next';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export const dynamic = 'force-dynamic';
const base = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const b = base();
  const venues = await db().select({ slug: schema.venues.slug }).from(schema.venues).where(eq(schema.venues.status, 'published'));
  return [
    ...['', '/venues', '/sessions', '/teams', '/help', '/terms', '/privacy', '/cancellation-policy'].map((p) => ({ url: b + p, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.6 })),
    ...venues.map((v) => ({ url: `${b}/venues/${v.slug}`, changeFrequency: 'daily' as const, priority: 0.8 })),
  ];
}
