import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { resetDb } from './helpers';
import { createFullReservation, cancelReservationByPlayer } from '@/server/booking/reservations';
import { simulatePay } from '@/server/booking/settle';
import { DomainError } from '@/server/booking/errors';
import { ownerStats } from '@/server/owner/stats';
import { getNotifPrefs, listMySessions, revokeMySession, revokeOtherSessions, saveNotifPrefs, wantsNotification } from '@/server/account';
import { createSession, getUserBySessionToken } from '@/server/auth/session';

import { createCancellationPolicy, createFeePolicy, listAudit, listUsers, setUserStatus, setVenueSuspended, updateSetting, validateTiers, adminOverview } from '@/server/admin';
import { getSetting } from '@/server/settings';
import { activeCancellationPolicy, activeFeePolicy } from '@/server/booking/policy';
import type { Actor } from '@/server/owner/venues';

let owner: Actor, other: Actor, admin: Actor, venueId: string, otherVenue: string, sportId: string, n = 0;
const H = 3_600_000;
async function mkUser(role: 'player' | 'venue_manager' | 'admin' = 'player', name = `کاربر ${n + 1}`) {
  const [u] = await db().insert(schema.users).values({ phoneE164: `+98911${String(2000000 + ++n)}`, role, displayName: name }).returning();
  await db().insert(schema.userProfiles).values({ userId: u.id }).onConflictDoNothing();
  return u.id;
}
async function code(p: Promise<unknown>) { const e = await p.then(() => null, (x) => x); return e instanceof DomainError ? e.code : e ? 'other:' + (e as Error).message : 'ok'; }
async function slot(vId: string, hours: number, price = 200000) {
  const s = new Date(Date.now() + hours * H);
  return (await db().insert(schema.timeSlots).values({ venueId: vId, sportId, startsAt: s, endsAt: new Date(s.getTime() + 1.5 * H), price }).returning())[0];
}
/** hours < 0 means "game already happened": booked in the future, then moved into the past. */
async function paidReservation(vId: string, hours: number, price = 200000) {
  const host = await mkUser(); const sl = await slot(vId, hours < 0 ? 72 : hours, price);
  const r = await createFullReservation(host, sl.id);
  await simulatePay(host, r.intentId);
  if (hours < 0) await sqlClient()`UPDATE time_slots SET starts_at = now() + ${hours + ' hours'}::interval, ends_at = now() + ${(hours + 1.5) + ' hours'}::interval WHERE id = ${sl.id}`;
  return { host, slot: sl, reservationId: r.reservationId };
}

beforeAll(async () => {
  await resetDb();
  const [city] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan', isDefault: true }).returning();
  const [sp] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [{ key: 'shooting', nameFa: 's' }] }).returning();
  sportId = sp.id;
  const o = await mkUser('venue_manager'), p = await mkUser('venue_manager'), a = await mkUser('admin');
  owner = { id: o, role: 'venue_manager' }; other = { id: p, role: 'venue_manager' }; admin = { id: a, role: 'admin' };
  const mk = async (uid: string, slug: string) => {
    const [v] = await db().insert(schema.venues).values({ ownerUserId: uid, cityId: city.id, slug, name: slug, address: 'x', status: 'published' }).returning();
    await db().insert(schema.venueSports).values({ venueId: v.id, sportId, pricePerSlot: 200000, maxCapacity: 12 });
    await db().insert(schema.venueManagers).values({ venueId: v.id, userId: uid, role: 'owner' });
    return v.id;
  };
  venueId = await mk(o, 'va'); otherVenue = await mk(p, 'vb');
});
beforeEach(async () => {
  await sqlClient()`TRUNCATE reservations, slot_claims, open_sessions, session_participants, payment_intents, payment_events, refunds, notifications, audit_logs RESTART IDENTITY CASCADE`;
  await sqlClient()`DELETE FROM time_slots`;
});
afterAll(async () => { await sqlClient().end(); });

describe('owner stats', () => {
  it('counts only the owner\'s venue, revenue = venue payable (no platform fee), 30-day series', async () => {
    const a = await paidReservation(venueId, -48, 200000); // game 2 days ago
    await paidReservation(otherVenue, -48, 900000);
    const s = await ownerStats(owner, null, 30);
    expect(s.bookings).toBe(1);
    expect(s.revenue).toBe(200000);
    expect(s.series).toHaveLength(30);
    expect(s.series.reduce((x, d) => x + d.revenue, 0)).toBe(200000);
    expect(s.recent.length).toBe(1);
    expect(a.reservationId).toBeTruthy();
  });
  it('cancelled reservations are not revenue; other owner\'s venue is 404', async () => {
    const r = await paidReservation(venueId, 96);
    await cancelReservationByPlayer(r.host, r.reservationId);
    const s = await ownerStats(owner, venueId, 30);
    expect(s.revenue).toBe(0);
    expect(await code(ownerStats(owner, otherVenue, 30))).toBe('not_found');
    expect(await code(ownerStats(owner, venueId, 0))).toBe('invalid');
  });
  it('admin sees every venue', async () => {
    await paidReservation(venueId, -24, 200000); await paidReservation(otherVenue, -24, 300000);
    expect((await ownerStats(admin, null, 30)).revenue).toBe(500000);
  });
});

describe('notification preferences', () => {
  it('pure rule: optional groups can be off, critical types never', () => {
    expect(wantsNotification({ sessions: false }, 'participant_joined')).toBe(false);
    expect(wantsNotification({ sessions: false }, 'reservation_cancelled')).toBe(true);
    expect(wantsNotification({}, 'participant_joined')).toBe(true);
    expect(wantsNotification({ rating: false }, 'no_show')).toBe(true);
  });
  it('saved prefs round-trip and are honored by notify()', async () => {
    const u = await mkUser();
    await saveNotifPrefs(u, { sessions: false, rating: true, teams: true, owner: true });
    expect(await getNotifPrefs(u)).toEqual({ sessions: false, rating: true, teams: true, owner: true });
    const { notify } = await import('@/server/booking/core');
    await db().transaction(async (tx) => { await notify(tx, u, 'participant_joined', 'x'); await notify(tx, u, 'reservation_cancelled', 'y'); await notify(tx, u, 'rate_game', 'z'); });
    const rows = await db().select().from(schema.notifications).where(eq(schema.notifications.userId, u));
    expect(rows.map((r) => r.type).sort()).toEqual(['rate_game', 'reservation_cancelled']);
  });
});

describe('sessions (devices)', () => {
  it('user can revoke own session, never someone else\'s; revoke-others keeps the current one', async () => {
    const u = await mkUser(); const v = await mkUser();
    const s1 = await createSession(u), s2 = await createSession(u), s3 = await createSession(v);
    const list = await listMySessions(u, s1.token);
    expect(list).toHaveLength(2);
    expect(list.filter((x) => x.current)).toHaveLength(1);
    const victim = (await listMySessions(v))[0];
    expect(await revokeMySession(u, victim.id)).toBe(false);          // not mine
    expect(await getUserBySessionToken(s3.token)).not.toBeNull();
    expect(await revokeOtherSessions(u, s1.token)).toBe(1);
    expect(await getUserBySessionToken(s1.token)).not.toBeNull();
    expect(await getUserBySessionToken(s2.token)).toBeNull();
  });
});

describe('admin: users', () => {
  it('only admins; suspend revokes sessions; reactivate works; cannot suspend admin or self', async () => {
    const u = await mkUser(); const s = await createSession(u);
    expect(await code(setUserStatus(owner as Actor, u, 'suspended'))).toBe('forbidden');
    expect(await code(listUsers(owner, {}))).toBe('forbidden');
    await setUserStatus(admin, u, 'suspended', 'تست');
    expect(await getUserBySessionToken(s.token)).toBeNull();
    await setUserStatus(admin, u, 'active');
    const [row] = await db().select().from(schema.users).where(eq(schema.users.id, u));
    expect(row.status).toBe('active');
    expect(await code(setUserStatus(admin, admin.id, 'suspended'))).toBe('invalid');
    const other2 = await mkUser('admin');
    expect(await code(setUserStatus(admin, other2, 'suspended'))).toBe('invalid');
    const a = await listAudit(admin, { action: 'user.' });
    expect(a.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['user.suspend', 'user.reactivate']));
  });
  it('search by name and by phone, with paging metadata', async () => {
    await mkUser('player', 'علیرضا یگانه');
    const r = await listUsers(admin, { text: 'یگانه' });
    expect(r.total).toBe(1);
    const byPhone = await listUsers(admin, { text: '09112' });
    expect(byPhone.total).toBeGreaterThan(1);
    expect((await adminOverview(admin)).users.users).toBeGreaterThan(3);
  });
});

describe('admin: venue suspension', () => {
  it('suspend / reinstate flow with owner notification; wrong state refused', async () => {
    await setVenueSuspended(admin, otherVenue, true, 'تخلف');
    expect((await db().select().from(schema.venues).where(eq(schema.venues.id, otherVenue)))[0].status).toBe('suspended');
    expect(await code(setVenueSuspended(admin, otherVenue, true))).toBe('bad_state');
    expect((await db().select().from(schema.notifications).where(eq(schema.notifications.userId, other.id))).length).toBe(1);
    await setVenueSuspended(admin, otherVenue, false);
    expect((await db().select().from(schema.venues).where(eq(schema.venues.id, otherVenue)))[0].status).toBe('published');
    expect(await code(setVenueSuspended(owner, venueId, true))).toBe('forbidden');
  });
});

describe('admin: settings & policies', () => {
  it('setting range validation, persists, and is read by the settings service', async () => {
    expect(await code(updateSetting(admin, 'hold_minutes', 2))).toBe('invalid');
    expect(await code(updateSetting(admin, 'hold_minutes', 9999))).toBe('invalid');
    expect(await code(updateSetting(admin, 'otp_ttl_seconds', 30))).toBe('invalid'); // not editable here
    expect(await code(updateSetting(owner, 'hold_minutes', 20))).toBe('forbidden');
    await updateSetting(admin, 'hold_minutes', 20);
    expect(await getSetting('hold_minutes')).toBe(20);
    await updateSetting(admin, 'hold_minutes', 15);
  });
  it('new fee policy applies to NEW reservations only; old keep their snapshot', async () => {
    const before = await paidReservation(venueId, 100, 200000);
    await createFeePolicy(admin, { percent: 10, minToman: 1000 });
    expect(await code(createFeePolicy(admin, { percent: 50, minToman: 0 }))).toBe('invalid');
    const p = await db().transaction((tx) => activeFeePolicy(tx));
    expect(p.percentBp).toBe(1000);
    const after = await paidReservation(venueId, 120, 200000);
    const [rb] = await db().select().from(schema.reservations).where(eq(schema.reservations.id, before.reservationId));
    const [ra] = await db().select().from(schema.reservations).where(eq(schema.reservations.id, after.reservationId));
    expect(rb.feeAmount).toBe(10000);   // 5%
    expect(ra.feeAmount).toBe(20000);   // 10%
    await db().delete(schema.feePolicies).where(eq(schema.feePolicies.percentBp, 1000));
  });
  it('cancellation policy: tier validation and versioning', async () => {
    expect(() => validateTiers([{ minHoursBefore: 24, refundPercent: 100 }])).toThrow();             // no 0h tier
    expect(() => validateTiers([{ minHoursBefore: 24, refundPercent: 50 }, { minHoursBefore: 0, refundPercent: 80 }])).toThrow(); // increasing
    expect(() => validateTiers([{ minHoursBefore: 0, refundPercent: 0 }, { minHoursBefore: 0, refundPercent: 0 }])).toThrow();     // duplicate
    expect(() => validateTiers([{ minHoursBefore: 0, refundPercent: 101 }])).toThrow();
    expect(validateTiers([{ minHoursBefore: 0, refundPercent: 0 }, { minHoursBefore: 48, refundPercent: 100 }]).map((t) => t.minHoursBefore)).toEqual([48, 0]);
    const oldRes = await paidReservation(venueId, 100);
    const v = await createCancellationPolicy(admin, [{ minHoursBefore: 48, refundPercent: 100 }, { minHoursBefore: 0, refundPercent: 0 }]);
    const act = await db().transaction((tx) => activeCancellationPolicy(tx));
    expect(act.version).toBe(v);
    const [r] = await db().select().from(schema.reservations).where(eq(schema.reservations.id, oldRes.reservationId));
    expect(r.policyVersion).toBeLessThan(v);
    expect(await code(createCancellationPolicy(owner, []))).toBe('forbidden');
    await db().delete(schema.cancellationPolicies).where(eq(schema.cancellationPolicies.version, v));
  });
});
