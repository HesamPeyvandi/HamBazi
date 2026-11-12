import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { resetDb } from './helpers';
import { createFullReservation } from '@/server/booking/reservations';
import { createOpenSession, joinSession } from '@/server/booking/sessions';
import { simulatePay } from '@/server/booking/settle';
import { DomainError } from '@/server/booking/errors';

let owner: string, venueId: string, sportId: string, n = 0;
const H = 3_600_000;
async function mkUser() {
  const [u] = await db().insert(schema.users).values({ phoneE164: `+98911000${String(1000 + ++n)}`, role: 'player', displayName: `کاربر ${n}` }).returning();
  return u.id;
}
async function mkSlot(hoursAhead = 72) {
  const s = new Date(Date.now() + hoursAhead * H);
  const [row] = await db().insert(schema.timeSlots).values({ venueId, sportId, startsAt: s, endsAt: new Date(s.getTime() + 1.5 * H), price: 200000 }).returning();
  return row;
}
const count = async (t: 'reservations' | 'payment_intents') => ((await sqlClient()`SELECT count(*)::int AS n FROM ${sqlClient()(t)}`)[0].n as number);

beforeAll(async () => {
  await resetDb();
  const [o] = await db().insert(schema.users).values({ phoneE164: '+989110009999', role: 'venue_manager', displayName: 'مدیر' }).returning();
  owner = o.id;
  const [city] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan', isDefault: true }).returning();
  const [sp] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [] }).returning();
  sportId = sp.id;
  const [v] = await db().insert(schema.venues).values({ ownerUserId: owner, cityId: city.id, slug: 'v1', name: 'v1', address: 'x', status: 'published' }).returning();
  await db().insert(schema.venueSports).values({ venueId: v.id, sportId, pricePerSlot: 200000, maxCapacity: 12 });
  await db().insert(schema.venueManagers).values({ venueId: v.id, userId: owner, role: 'owner' });
  venueId = v.id;
});
beforeEach(async () => {
  await sqlClient()`TRUNCATE reservations, slot_claims, open_sessions, session_participants, payment_intents, payment_events, refunds, notifications RESTART IDENTITY CASCADE`;
  await sqlClient()`DELETE FROM time_slots`;
});
afterAll(async () => { await sqlClient().end(); });

describe('double-submit idempotency (phase 11)', () => {
  it('full reservation: repeating the same request returns the SAME reservation and intent', async () => {
    const u = await mkUser(); const slot = await mkSlot();
    const a = await createFullReservation(u, slot.id);
    const b = await createFullReservation(u, slot.id);
    expect(b.reservationId).toBe(a.reservationId); expect(b.intentId).toBe(a.intentId);
    expect(await count('reservations')).toBe(1); expect(await count('payment_intents')).toBe(1);
  });
  it('full reservation: concurrent duplicate submits create exactly one reservation', async () => {
    const u = await mkUser(); const slot = await mkSlot();
    const res = await Promise.all([1, 2, 3].map(() => createFullReservation(u, slot.id)));
    expect(new Set(res.map((r) => r.intentId)).size).toBe(1);
    expect(await count('reservations')).toBe(1);
  });
  it('another user still gets slot_unavailable', async () => {
    const u = await mkUser(), v = await mkUser(); const slot = await mkSlot();
    await createFullReservation(u, slot.id);
    const e = await createFullReservation(v, slot.id).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(DomainError); expect((e as DomainError).code).toBe('slot_unavailable');
  });
  it('after payment, a repeated request is no longer a hold (slot is booked)', async () => {
    const u = await mkUser(); const slot = await mkSlot();
    const a = await createFullReservation(u, slot.id); await simulatePay(u, a.intentId);
    const e = await createFullReservation(u, slot.id).then(() => null, (x) => x);
    expect((e as DomainError).code).toBe('slot_unavailable');
  });
  it('open session: repeating create returns the same session/intent; concurrent duplicates make one', async () => {
    const u = await mkUser(); const slot = await mkSlot();
    const input = { slotId: slot.id, targetCount: 6, joinDeadline: new Date(slot.startsAt.getTime() - 24 * H) };
    const a = await createOpenSession(u, input);
    const b = await createOpenSession(u, input);
    expect(b.sessionId).toBe(a.sessionId); expect(b.intentId).toBe(a.intentId); expect(b.share).toBe(a.share); expect(b.inviteToken).toBe(a.inviteToken);
    const u2 = await mkUser(); const slot2 = await mkSlot(96);
    const many = await Promise.all([1, 2, 3].map(() => createOpenSession(u2, { slotId: slot2.id, targetCount: 4, joinDeadline: new Date(slot2.startsAt.getTime() - 24 * H) })));
    expect(new Set(many.map((m) => m.sessionId)).size).toBe(1);
    expect((await db().select().from(schema.openSessions).where(eq(schema.openSessions.slotId, slot2.id))).length).toBe(1);
  });
  it('join: repeating the join while the seat is held returns the same intent; paying twice is a no-op', async () => {
    const host = await mkUser(), p = await mkUser(); const slot = await mkSlot();
    const s = await createOpenSession(host, { slotId: slot.id, targetCount: 4, joinDeadline: new Date(slot.startsAt.getTime() - 24 * H) });
    await simulatePay(host, s.intentId);
    const j1 = await joinSession(p, s.sessionId); const j2 = await joinSession(p, s.sessionId);
    expect(j2.intentId).toBe(j1.intentId); expect(j2.participantId).toBe(j1.participantId);
    const p1 = await simulatePay(p, j1.intentId); const p2 = await simulatePay(p, j1.intentId);
    expect(p1.already).toBe(false); expect(p2.already).toBe(true);
    const e = await joinSession(p, s.sessionId).then(() => null, (x) => x);
    expect((e as DomainError).code).toBe('already_joined');
  });
});
