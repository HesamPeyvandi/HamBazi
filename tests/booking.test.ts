import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { resetDb } from './helpers';
import { createFullReservation, cancelReservationByPlayer, cancelReservationByVenue, getMyReservation } from '@/server/booking/reservations';
import { createOpenSession, joinSession, leaveSession, getSessionDetail, listOpenSessions } from '@/server/booking/sessions';
import { simulatePay } from '@/server/booking/settle';
import { sweepDue } from '@/server/booking/lifecycle';
import { calcFee, refundPercentFor, suggestPricePerParticipant, refundAmount } from '@/server/booking/money';
import { DomainError } from '@/server/booking/errors';

let owner: string, other: string, venueId: string, venue2Id: string, sportId: string;
const H = 3_600_000;
let n = 0;

async function mkUser(role: 'player' | 'venue_manager' = 'player') {
  const [u] = await db().insert(schema.users).values({ phoneE164: `+98900000${String(1000 + ++n)}`, role, displayName: `کاربر ${n}` }).returning();
  return u.id;
}
async function mkSlot(hoursAhead: number, price = 200000, vId = venueId) {
  const s = new Date(Date.now() + hoursAhead * H);
  const [row] = await db().insert(schema.timeSlots).values({ venueId: vId, sportId, startsAt: s, endsAt: new Date(s.getTime() + 1.5 * H), price }).returning();
  return row;
}
const slotStatus = async (id: string) => (await db().select().from(schema.timeSlots).where(eq(schema.timeSlots.id, id)))[0].status;
async function expectCode(p: Promise<unknown>, code: string) {
  const r = await p.then(() => null, (e) => e);
  expect(r).toBeInstanceOf(DomainError);
  expect((r as DomainError).code).toBe(code);
}

beforeAll(async () => {
  await resetDb();
  owner = await mkUser('venue_manager'); other = await mkUser('venue_manager');
  const [city] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan', isDefault: true }).returning();
  const [sp] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [] }).returning();
  sportId = sp.id;
  const mk = async (slug: string, o: string) => {
    const [v] = await db().insert(schema.venues).values({ ownerUserId: o, cityId: city.id, slug, name: slug, address: 'x', status: 'published' }).returning();
    await db().insert(schema.venueSports).values({ venueId: v.id, sportId, pricePerSlot: 200000, maxCapacity: 12 });
    await db().insert(schema.venueManagers).values({ venueId: v.id, userId: o, role: 'owner' });
    return v.id;
  };
  venueId = await mk('v1', owner); venue2Id = await mk('v2', other);
});
beforeEach(async () => {
  await sqlClient()`TRUNCATE reservations, slot_claims, open_sessions, session_participants, payment_intents, payment_events, refunds, notifications RESTART IDENTITY CASCADE`;
  await sqlClient()`DELETE FROM time_slots`;
});
afterAll(async () => { await sqlClient().end(); });

describe('money rules', () => {
  it('fee: 5% rounded up to 10 toman, with minimum', () => {
    expect(calcFee(200000, { percentBp: 500, minToman: 5000 })).toBe(10000);
    expect(calcFee(50000, { percentBp: 500, minToman: 5000 })).toBe(5000);
    expect(calcFee(123457, { percentBp: 500, minToman: 0 })).toBe(6180);
  });
  it('policy tiers and refund amounts', () => {
    const t = [{ minHoursBefore: 24, refundPercent: 100 }, { minHoursBefore: 0, refundPercent: 50 }];
    expect(refundPercentFor(t, 48)).toBe(100); expect(refundPercentFor(t, 24)).toBe(100);
    expect(refundPercentFor(t, 23.9)).toBe(50); expect(refundPercentFor(t, -1)).toBe(0);
    expect(refundAmount(210001, 50)).toBe(105000);
    expect(suggestPricePerParticipant(200000, 7)).toBe(29000);
  });
});

describe('full reservation, hold and double booking', () => {
  it('holds the slot, rejects a second claimant, confirms on simulated payment', async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const slot = await mkSlot(48);
    const r = await createFullReservation(a, slot.id);
    expect(await slotStatus(slot.id)).toBe('held');
    await expectCode(createFullReservation(b, slot.id), 'slot_unavailable');
    const pay = await simulatePay(a, r.intentId);
    expect(pay.already).toBe(false);
    expect(await slotStatus(slot.id)).toBe('booked');
    const d = await getMyReservation(a, r.reservationId);
    expect(d?.r.status).toBe('confirmed'); expect(d?.r.totalAmount).toBe(210000); expect(d?.r.policyVersion).toBe(1);
  });
  it('concurrent attempts on the same slot: exactly one wins', async () => {
    const us = await Promise.all(Array.from({ length: 8 }, () => mkUser()));
    const slot = await mkSlot(48);
    const res = await Promise.allSettled(us.map((u) => createFullReservation(u, slot.id)));
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const claims = await db().select().from(schema.slotClaims).where(eq(schema.slotClaims.slotId, slot.id));
    expect(claims.filter((c) => c.status === 'held')).toHaveLength(1);
  });
  it('the database itself refuses a second active claim', async () => {
    const a = await mkUser(); const slot = await mkSlot(48);
    const r = await createFullReservation(a, slot.id);
    await expect(db().insert(schema.slotClaims).values({ slotId: slot.id, reservationId: r.reservationId, status: 'held' })).rejects.toThrow();
  });
  it('expired hold frees the slot lazily and blocks late payment', async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const slot = await mkSlot(48);
    const r = await createFullReservation(a, slot.id);
    await sqlClient()`UPDATE slot_claims SET hold_expires_at = now() - interval '1 minute'`;
    await expectCode(simulatePay(a, r.intentId), 'hold_expired');
    expect(await slotStatus(slot.id)).toBe('open');
    const second = await createFullReservation(b, slot.id);
    expect(second.reservationId).not.toBe(r.reservationId);
    expect((await getMyReservation(a, r.reservationId))?.r.status).toBe('expired');
  });
  it('a new booker also benefits from lazy expiry without any cron', async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const slot = await mkSlot(48);
    await createFullReservation(a, slot.id);
    await sqlClient()`UPDATE slot_claims SET hold_expires_at = now() - interval '1 second'`;
    await expect(createFullReservation(b, slot.id)).resolves.toBeTruthy();
  });
  it('payment is idempotent and cannot be forged by another user', async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const r = await createFullReservation(a, (await mkSlot(48)).id);
    await expectCode(simulatePay(b, r.intentId), 'not_found');
    const [p1, p2] = await Promise.all([simulatePay(a, r.intentId), simulatePay(a, r.intentId)]);
    expect([p1.already, p2.already].sort()).toEqual([false, true]);
    const ev = await db().select().from(schema.paymentEvents).where(eq(schema.paymentEvents.toStatus, 'succeeded'));
    expect(ev).toHaveLength(1);
  });
  it('rejects past/too-near slots and unpublished venues', async () => {
    const a = await mkUser();
    await expectCode(createFullReservation(a, (await mkSlot(0.2)).id), 'too_late');
    await sqlClient()`UPDATE venues SET status = 'pending' WHERE id = ${venue2Id}`;
    await expectCode(createFullReservation(a, (await mkSlot(48, 200000, venue2Id)).id), 'not_found');
    await sqlClient()`UPDATE venues SET status = 'published' WHERE id = ${venue2Id}`;
  });
  it('payment events are append-only and intent amounts immutable', async () => {
    const a = await mkUser(); const r = await createFullReservation(a, (await mkSlot(48)).id);
    await expect(sqlClient()`UPDATE payment_events SET to_status = 'x'`).rejects.toThrow();
    await expect(sqlClient()`UPDATE payment_intents SET amount = 1 WHERE id = ${r.intentId}`).rejects.toThrow();
  });
});

describe('cancellation and simulated refunds', () => {
  it('>24h: 100% refund; <24h: 50% (policy snapshot); after start: none; reservation stays visible only to host', async () => {
    const a = await mkUser();
    const far = await createFullReservation(a, (await mkSlot(72)).id); await simulatePay(a, far.intentId);
    expect((await cancelReservationByPlayer(a, far.reservationId)).refundPercent).toBe(100);
    const near = await createFullReservation(a, (await mkSlot(5)).id); await simulatePay(a, near.intentId);
    expect((await cancelReservationByPlayer(a, near.reservationId)).refundPercent).toBe(50);
    const refunds = await db().select().from(schema.refunds);
    expect(refunds.map((r) => [r.percent, r.amount, r.mode]).sort()).toEqual([[100, 210000, 'simulated'], [50, 105000, 'simulated']].sort());
    const b = await mkUser();
    expect(await getMyReservation(b, far.reservationId)).toBeNull();
    await expectCode(cancelReservationByPlayer(b, near.reservationId), 'not_found');
    await expectCode(cancelReservationByPlayer(a, near.reservationId), 'bad_state'); // no double refund
  });
  it('unpaid cancellation releases the slot with no refund', async () => {
    const a = await mkUser(); const slot = await mkSlot(72);
    const r = await createFullReservation(a, slot.id);
    await cancelReservationByPlayer(a, r.reservationId);
    expect(await slotStatus(slot.id)).toBe('open');
    expect(await db().select().from(schema.refunds)).toHaveLength(0);
  });
  it('venue cancellation: 100% refund; other venue managers cannot cancel', async () => {
    const a = await mkUser(); const slot = await mkSlot(3);
    const r = await createFullReservation(a, slot.id); await simulatePay(a, r.intentId);
    await expectCode(cancelReservationByVenue({ id: other, role: 'venue_manager' }, r.reservationId), 'not_found');
    await cancelReservationByVenue({ id: owner, role: 'venue_manager' }, r.reservationId);
    expect((await db().select().from(schema.refunds))[0].percent).toBe(100);
    expect(await slotStatus(slot.id)).toBe('open');
    const notes = await db().select().from(schema.notifications).where(eq(schema.notifications.userId, a));
    expect(notes.some((x) => x.type === 'reservation_cancelled')).toBe(true);
  });
});

describe('open sessions', () => {
  const mkSession = async (host: string, hoursAhead = 72, over: Partial<Parameters<typeof createOpenSession>[1]> = {}) => {
    const slot = await mkSlot(hoursAhead);
    const s = await createOpenSession(host, { slotId: slot.id, targetCount: 10, minToConfirm: 7, pricePerParticipant: 29000, joinDeadline: new Date(Date.now() + 24 * H), ...over });
    await simulatePay(host, s.intentId);
    return { slot, ...s };
  };
  const joinAndPay = async (sessionId: string, user: string) => { const j = await joinSession(user, sessionId); await simulatePay(user, j.intentId); };

  it('custom target 7 of 10: confirms exactly at 7 and collects fees per share', async () => {
    const host = await mkUser(); const s = await mkSession(host);
    let det = await getSessionDetail(s.sessionId, host);
    expect(det?.session.status).toBe('collecting'); expect(det?.confirmedCount).toBe(1);
    for (let i = 0; i < 5; i++) await joinAndPay(s.sessionId, await mkUser());
    expect((await getSessionDetail(s.sessionId, host))?.session.status).toBe('collecting');
    await joinAndPay(s.sessionId, await mkUser());
    det = await getSessionDetail(s.sessionId, host);
    expect(det?.session.status).toBe('confirmed'); expect(det?.confirmedCount).toBe(7);
    expect(det?.participants.every((p) => p.payment === 'succeeded')).toBe(true);
    const it = (await db().select().from(schema.paymentIntents))[0];
    expect(it.amount).toBe(it.baseAmount + it.feeAmount); expect(it.feeAmount).toBe(5000);
  });
  it('rejects duplicate join, enforces capacity, skill range and invite-only', async () => {
    const host = await mkUser(); const s = await mkSession(host, 72, { targetCount: 3, minToConfirm: 3, pricePerParticipant: 70000 });
    const u1 = await mkUser(); await joinAndPay(s.sessionId, u1);
    await expectCode(joinSession(u1, s.sessionId), 'already_joined');
    const u2 = await mkUser(); await joinSession(u2, s.sessionId); // pending hold takes the last seat
    await expectCode(joinSession(await mkUser(), s.sessionId), 'full');
    const pro = await mkSession(await mkUser(), 80, { skillMin: 70, skillMax: 99 });
    await expectCode(joinSession(await mkUser(), pro.sessionId), 'skill_range');
    const priv = await mkSession(await mkUser(), 90, { visibility: 'invite_only' });
    const x = await mkUser();
    await expectCode(joinSession(x, priv.sessionId), 'invite_only');
    await expect(joinSession(x, priv.sessionId, { inviteToken: priv.inviteToken })).resolves.toBeTruthy();
    expect(await getSessionDetail(priv.sessionId, await mkUser())).toBeNull();
    expect((await listOpenSessions()).some((r) => r.s.id === priv.sessionId)).toBe(false);
  });
  it('concurrent joins never exceed capacity', async () => {
    const host = await mkUser(); const s = await mkSession(host, 72, { targetCount: 4, minToConfirm: 4, pricePerParticipant: 50000 });
    const us = await Promise.all(Array.from({ length: 8 }, () => mkUser()));
    const res = await Promise.allSettled(us.map((u) => joinSession(u, s.sessionId)));
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(3); // host already holds one seat
  });
  it('abandoned participant hold frees the seat', async () => {
    const host = await mkUser(); const s = await mkSession(host, 72, { targetCount: 2, minToConfirm: 2, pricePerParticipant: 100000 });
    const u = await mkUser(); await joinSession(u, s.sessionId);
    await expectCode(joinSession(await mkUser(), s.sessionId), 'full');
    await sqlClient()`UPDATE session_participants SET hold_expires_at = now() - interval '1 minute' WHERE status = 'pending_payment'`;
    await expect(joinSession(await mkUser(), s.sessionId)).resolves.toBeTruthy();
  });
  it('host who never pays: session expires, slot freed', async () => {
    const host = await mkUser(); const slot = await mkSlot(72);
    const s = await createOpenSession(host, { slotId: slot.id, targetCount: 10, minToConfirm: 7, pricePerParticipant: 29000 });
    await sqlClient()`UPDATE slot_claims SET hold_expires_at = now() - interval '1 minute'`;
    await sqlClient()`UPDATE session_participants SET hold_expires_at = now() - interval '1 minute'`;
    await sweepDue();
    expect(await slotStatus(slot.id)).toBe('open');
    expect((await db().select().from(schema.openSessions))[0].status).toBe('expired');
    await expectCode(simulatePay(host, s.intentId), 'bad_state');
  });
  it('deadline missed target: auto-cancel with simulated refund records for all paid', async () => {
    const host = await mkUser(); const s = await mkSession(host);
    const [u1, u2] = [await mkUser(), await mkUser()];
    await joinAndPay(s.sessionId, u1); await joinAndPay(s.sessionId, u2);
    await sqlClient()`UPDATE open_sessions SET join_deadline = now() - interval '1 minute'`;
    const r = await sweepDue();
    expect(r.sessionsProcessed).toBeGreaterThan(0);
    expect((await db().select().from(schema.openSessions))[0].status).toBe('cancelled');
    const refunds = await db().select().from(schema.refunds);
    expect(refunds).toHaveLength(3); expect(refunds.every((x) => x.percent === 100 && x.mode === 'simulated')).toBe(true);
    expect(await slotStatus(s.slot.id)).toBe('open');
    const note = await db().select().from(schema.notifications).where(eq(schema.notifications.userId, u1));
    expect(note.some((x) => x.type === 'session_cancelled')).toBe(true);
    await sweepDue(); expect(await db().select().from(schema.refunds)).toHaveLength(3); // idempotent
    await expectCode(joinSession(await mkUser(), s.sessionId), 'bad_state');
  });
  it('deadline with target met stays confirmed', async () => {
    const host = await mkUser(); const s = await mkSession(host, 72, { targetCount: 3, minToConfirm: 2, pricePerParticipant: 100000 });
    await joinAndPay(s.sessionId, await mkUser());
    await sqlClient()`UPDATE open_sessions SET join_deadline = now() - interval '1 minute'`;
    await sweepDue();
    expect((await db().select().from(schema.openSessions))[0].status).toBe('confirmed');
  });
  it('leaving follows the policy; host cancel refunds everyone (host by tier)', async () => {
    const host = await mkUser(); const s = await mkSession(host, 5, { targetCount: 4, minToConfirm: 3, pricePerParticipant: 70000, joinDeadline: new Date(Date.now() + 2 * H) });
    const u = await mkUser(); await joinAndPay(s.sessionId, u);
    expect((await leaveSession(u, s.sessionId)).refundPercent).toBe(50);
    await expectCode(leaveSession(host, s.sessionId), 'bad_state');
    const u2 = await mkUser(); await joinAndPay(s.sessionId, u2);
    const hostRes = (await db().select().from(schema.reservations))[0];
    expect((await cancelReservationByPlayer(host, hostRes.id)).refundPercent).toBe(50);
    const rf = await db().select().from(schema.refunds);
    expect(rf.map((x) => x.percent).sort()).toEqual([100, 50, 50]);
    expect(await getSessionDetail(s.sessionId, host)).toMatchObject({ session: { status: 'cancelled' } });
  });
  it('validation: target above venue capacity or price not covering the venue', async () => {
    const host = await mkUser(); const slot = await mkSlot(72);
    await expectCode(createOpenSession(host, { slotId: slot.id, targetCount: 13, minToConfirm: 7, pricePerParticipant: 50000 }), 'invalid');
    await expectCode(createOpenSession(host, { slotId: slot.id, targetCount: 10, minToConfirm: 7, pricePerParticipant: 10000 }), 'invalid');
    await expectCode(createOpenSession(host, { slotId: slot.id, targetCount: 10, minToConfirm: 11, pricePerParticipant: 50000 }), 'invalid');
    expect(await slotStatus(slot.id)).toBe('open');
  });
  it('payment status is visible to host only', async () => {
    const host = await mkUser(); const s = await mkSession(host); const u = await mkUser(); await joinAndPay(s.sessionId, u);
    expect((await getSessionDetail(s.sessionId, host))?.participants[1].payment).toBe('succeeded');
    expect((await getSessionDetail(s.sessionId, u))?.participants[1].payment).toBeUndefined();
    expect((await getSessionDetail(s.sessionId, u))?.session.inviteToken).toBeUndefined();
  });
});

describe('production safety', () => {
  it('simulated payments are refused in production', async () => {
    const a = await mkUser(); const slot = await mkSlot(48);
    const old = process.env.APP_ENV; process.env.APP_ENV = 'production';
    const { __resetEnvCache } = await import('@/server/env'); __resetEnvCache();
    try { await expect(createFullReservation(a, slot.id)).rejects.toThrow(/Unsafe|payments/i); }
    finally { process.env.APP_ENV = old; __resetEnvCache(); }
    expect(await slotStatus(slot.id)).toBe('open'); // whole tx rolled back
  });
});
