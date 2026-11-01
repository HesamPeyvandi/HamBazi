import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { resetDb } from './helpers';
import { createFullReservation, cancelReservationByPlayer } from '@/server/booking/reservations';
import { simulatePay } from '@/server/booking/settle';
import { MAX_ACTIVE_HOLDS } from '@/server/booking/hold';
import { addStaff, removeStaff, createSlots } from '@/server/owner/venues';
import { DomainError } from '@/server/booking/errors';

let ownerId: string, venueId: string, sportId: string;
const H = 3_600_000;
let n = 0;
async function mkUser(role: 'player' | 'venue_manager' = 'player') {
  const [u] = await db().insert(schema.users).values({ phoneE164: `+98901${String(1000000 + ++n)}`, role, displayName: `کاربر ${n}` }).returning();
  return u;
}
async function mkSlot(hoursAhead: number) {
  const s = new Date(Date.now() + hoursAhead * H);
  const [row] = await db().insert(schema.timeSlots).values({ venueId, sportId, startsAt: s, endsAt: new Date(s.getTime() + 1.5 * H), price: 200000 }).returning();
  return row;
}
const code = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as DomainError | null;

beforeAll(async () => {
  await resetDb();
  const owner = await mkUser('venue_manager'); ownerId = owner.id;
  const [city] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan', isDefault: true }).returning();
  const [sp] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [] }).returning();
  sportId = sp.id;
  const [v] = await db().insert(schema.venues).values({ ownerUserId: ownerId, cityId: city.id, slug: 'p9', name: 'سالن آزمون', address: 'x', status: 'published' }).returning();
  venueId = v.id;
  await db().insert(schema.venueSports).values({ venueId, sportId, pricePerSlot: 200000, maxCapacity: 12 });
  await db().insert(schema.venueManagers).values({ venueId, userId: ownerId, role: 'owner' });
});
beforeEach(async () => {
  await sqlClient()`TRUNCATE reservations, slot_claims, open_sessions, session_participants, payment_intents, payment_events, refunds, notifications RESTART IDENTITY CASCADE`;
  await sqlClient()`DELETE FROM time_slots`;
});
afterAll(async () => { await sqlClient().end(); });

describe('phase 9 hardening', () => {
  it('limits how many unpaid holds one user can keep', async () => {
    const u = await mkUser();
    for (let i = 0; i < MAX_ACTIVE_HOLDS; i++) await createFullReservation(u.id, (await mkSlot(48 + i * 2)).id);
    const e = await code(createFullReservation(u.id, (await mkSlot(80)).id));
    expect(e).toBeInstanceOf(DomainError);
    // another user is not affected
    const other = await mkUser();
    await expect(createFullReservation(other.id, (await mkSlot(90)).id)).resolves.toBeTruthy();
  });

  it('a confirmed reservation cannot be cancelled once the game has started', async () => {
    const u = await mkUser();
    const slot = await mkSlot(48);
    const r = await createFullReservation(u.id, slot.id);
    await simulatePay(u.id, r.intentId);
    // move the slot into the past (started 10 minutes ago)
    await sqlClient()`UPDATE time_slots SET starts_at = now() - interval '10 minutes', ends_at = now() + interval '80 minutes' WHERE id = ${slot.id}`;
    const e = await code(cancelReservationByPlayer(u.id, r.reservationId));
    expect(e).toBeInstanceOf(DomainError);
    const [row] = await db().select().from(schema.reservations).where(eq(schema.reservations.id, r.reservationId));
    expect(row.status).toBe('confirmed');
  });

  it('staff: generic error for unknown numbers, notification on add, demotion on removal', async () => {
    const owner = { id: ownerId, role: 'venue_manager' as const };
    const e = await code(addStaff(owner as never, venueId, '09129999999'));
    expect(e?.message).not.toMatch(/ثبت‌نام نکرده/);
    const p = await mkUser('player');
    const phone = '0' + p.phoneE164.slice(3);
    await addStaff(owner as never, venueId, phone);
    expect((await db().select().from(schema.users).where(eq(schema.users.id, p.id)))[0].role).toBe('venue_manager');
    expect((await db().select().from(schema.notifications).where(eq(schema.notifications.userId, p.id))).length).toBe(1);
    await removeStaff(owner as never, venueId, p.id);
    expect((await db().select().from(schema.users).where(eq(schema.users.id, p.id)))[0].role).toBe('player');
  });

  it('slot creation rejects absurd hours and dates', async () => {
    const owner = { id: ownerId, role: 'venue_manager' as const };
    const base = { sportId, days: [{ y: 2030, m: 1, d: 5 }], startHour: 17, startMin: 0, endHour: 23 };
    for (const bad of [{ endHour: 100000 }, { startHour: -1 }, { endHour: 10 }, { startMin: 99 }, { days: [{ y: 1, m: 1, d: 1 }] }, { days: [{ y: 2030, m: 13, d: 1 }] }]) {
      expect(await code(createSlots(owner as never, venueId, { ...base, ...bad }))).toBeInstanceOf(DomainError);
    }
  });
});
