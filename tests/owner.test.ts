import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { db, schema, sqlClient } from '@/db/client';
import { resetDb } from './helpers';
import { addVenueImage, createSlots, createVenue, deleteSlot, getOwnerVenue, reviewVenue, setSlotOpen, submitForReview, updateVenue, becomeVenueManager, type Actor } from '@/server/owner/venues';
import { createFullReservation } from '@/server/booking/reservations';
import { simulatePay } from '@/server/booking/settle';
import { sniffImage } from '@/server/storage';
import { DomainError } from '@/server/booking/errors';
import { tehranParts } from '@/lib/i18n/jalali';

let A: Actor, B: Actor, admin: Actor, player: string, cityId: string, sportId: string;
const input = () => ({ name: 'سالن آزمایشی', cityId, address: 'سمنان، خیابان آزمایش', neighborhood: 'مرکز', sports: [{ sportId, price: 200000, minutes: 90, maxCapacity: 12 }], facilities: ['parking', 'bogus'], rules: ['قانون ۱'] });
async function code(p: Promise<unknown>) { const e = await p.then(() => null, (x) => x); return e instanceof DomainError ? e.code : e ? 'other' : 'ok'; }
const png = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#0a0' } }).png().toBuffer();

beforeAll(async () => {
  await resetDb();
  const mk = async (phone: string, role: 'player' | 'venue_manager' | 'admin') => (await db().insert(schema.users).values({ phoneE164: phone, role }).returning())[0];
  const [a, b, ad, p] = [await mk('+989100000001', 'venue_manager'), await mk('+989100000002', 'venue_manager'), await mk('+989100000003', 'admin'), await mk('+989100000004', 'player')];
  A = { id: a.id, role: 'venue_manager' }; B = { id: b.id, role: 'venue_manager' }; admin = { id: ad.id, role: 'admin' }; player = p.id;
  cityId = (await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan' }).returning())[0].id;
  sportId = (await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [] }).returning())[0].id;
});
afterAll(async () => { await sqlClient().end(); });

describe('owner journey', () => {
  let venueId: string;
  it('players cannot create venues; they can upgrade themselves (audited)', async () => {
    expect(await code(createVenue({ id: player, role: 'player' }, input()))).toBe('forbidden');
    await becomeVenueManager(player);
    expect((await db().select().from(schema.users).where(eq(schema.users.id, player)))[0].role).toBe('venue_manager');
    expect((await db().select().from(schema.auditLogs)).some((l) => l.action === 'user.become_venue_manager')).toBe(true);
  });
  it('creates a draft venue, unknown facilities are dropped, validation errors are Persian', async () => {
    expect(await code(createVenue(A, { ...input(), name: 'ab' }))).toBe('invalid');
    expect(await code(createVenue(A, { ...input(), sports: [] }))).toBe('invalid');
    expect(await code(createVenue(A, { ...input(), lat: 35.57 }))).toBe('invalid');                       // half a position
    expect(await code(createVenue(A, { ...input(), lat: 53.39, lng: 35.57 }))).toBe('invalid');           // swapped lat/lng
    expect(await code(createVenue(A, { ...input(), lat: 51.5, lng: -0.12 }))).toBe('invalid');            // outside Iran
    const v = await createVenue(A, input()); venueId = v.id;
    expect(v.status).toBe('draft');
    const d = await getOwnerVenue(A, venueId);
    expect(d.facilities).toEqual(['parking']); expect(d.venue.capacity).toBe(12);
  });
  it('another owner cannot read or edit it (IDOR)', async () => {
    expect(await code(getOwnerVenue(B, venueId))).toBe('not_found');
    expect(await code(updateVenue(B, venueId, input()))).toBe('not_found');
    expect(await code(submitForReview(B, venueId))).toBe('not_found');
    expect(await code(addVenueImage(B, venueId, await png()))).toBe('not_found');
  });
  it('needs a photo before review; upload validates real image bytes', async () => {
    expect(await code(submitForReview(A, venueId))).toBe('invalid');
    expect(await code(addVenueImage(A, venueId, Buffer.from('<?php echo 1; ?>'.repeat(10))))).toBe('upload');
    expect(await code(addVenueImage(A, venueId, Buffer.alloc(5 * 1024 * 1024, 1)))).toBe('upload');
    expect(sniffImage(await png())).toBe('png');
    await addVenueImage(A, venueId, await png());
    expect((await getOwnerVenue(A, venueId)).images).toHaveLength(1);
  });
  it('slots are blocked until admin approval; only admin may review', async () => {
    const day = tehranParts(new Date(Date.now() + 3 * 86400_000));
    const batch = { sportId, days: [{ y: day.y, m: day.m, d: day.d }], startHour: 17, startMin: 0, endHour: 23 };
    await submitForReview(A, venueId);
    expect(await code(createSlots(A, venueId, batch))).toBe('invalid');
    expect(await code(reviewVenue(A as Actor, venueId, 'approve'))).toBe('forbidden');
    await reviewVenue(admin, venueId, 'approve');
    expect(await code(reviewVenue(admin, venueId, 'approve'))).toBe('bad_state');
    const r = await createSlots(A, venueId, batch);
    expect(r.created).toBe(4); // 17:00..23:00 in 90-minute slots
    expect(await createSlots(A, venueId, batch)).toEqual({ created: 0, skipped: 4 }); // idempotent
    const notes = await db().select().from(schema.notifications).where(eq(schema.notifications.userId, A.id));
    expect(notes.some((n) => n.type === 'venue_review')).toBe(true);
  });
  it('open/close/delete slots; booked slots are protected; other owners cannot touch them', async () => {
    const slots = await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.venueId, venueId));
    const [s1, s2, s3] = slots;
    await setSlotOpen(A, s1.id, false);
    expect((await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.id, s1.id)))[0].status).toBe('closed');
    expect(await code(createFullReservation(player, s1.id))).toBe('slot_unavailable');
    await setSlotOpen(A, s1.id, true);
    expect(await code(setSlotOpen(B, s1.id, false))).toBe('not_found');
    const r = await createFullReservation(player, s2.id); await simulatePay(player, r.intentId);
    expect(await code(setSlotOpen(A, s2.id, false))).toBe('bad_state');
    expect(await code(deleteSlot(A, s2.id))).toBe('bad_state');
    await deleteSlot(A, s3.id);
    expect((await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.id, s3.id)))).toHaveLength(0);
  });
  it('rejected venue goes back to draft with a note to the owner; sports with slots cannot be dropped', async () => {
    const v2 = await createVenue(B, input());
    await addVenueImage(B, v2.id, await png()); await submitForReview(B, v2.id);
    await reviewVenue(admin, v2.id, 'reject', 'عکس‌ها واضح نیست');
    expect((await db().select().from(schema.venues).where(eq(schema.venues.id, v2.id)))[0].status).toBe('draft');
    const [other] = await db().insert(schema.sports).values({ key: 'volleyball', nameFa: 'والیبال', defaultCapacity: 12, skillCategories: [] }).returning();
    expect(await code(updateVenue(A, venueId, { ...input(), sports: [{ sportId: other.id, price: 100000, minutes: 60, maxCapacity: 12 }] }))).toBe('invalid');
  });
});
