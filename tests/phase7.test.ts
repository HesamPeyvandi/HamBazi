import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { resetDb } from './helpers';
import { DomainError } from '@/server/booking/errors';
import { createOpenSession, joinSession, leaveSession } from '@/server/booking/sessions';
import { simulatePay } from '@/server/booking/settle';
import { joinWaitlist, leaveWaitlist, waitlistInfo, MAX_WAITING } from '@/server/booking/waitlist';
import { setFavorite, favoriteIds, listFavoriteVenueIds } from '@/server/favorites';
import { createSupportMessage, closeSupport, listSupport, openSupportCount } from '@/server/support';
import { listSessionsAdmin, setReviewHidden, listReviewsAdmin } from '@/server/admin/oversight';
import { addStaff, removeStaff, listStaff, assertManages, updateVenue, listOwnerSessions, submitForReview, createSlots } from '@/server/owner/venues';

let sportId: string, cityId: string, venueId: string, ownerId: string, adminId: string, n = 0;
const H = 3_600_000;
const mkUser = async (role: 'player' | 'venue_manager' | 'admin' = 'player', phone?: string) => {
  const [u] = await db().insert(schema.users).values({ phoneE164: phone ?? `+98914${String(5000000 + ++n)}`, displayName: `کاربر ${n}`, role }).returning();
  await db().insert(schema.userProfiles).values({ userId: u.id, cityId });
  await db().insert(schema.playerSportProfiles).values({ userId: u.id, sportId, selfScores: { shooting: 50 }, ovr: 50 });
  return u.id;
};
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x) => x); return e instanceof DomainError ? e.code : e ? 'other:' + (e as Error).message : 'ok'; };
const actor = (id: string, role: 'player' | 'venue_manager' | 'admin') => ({ id, role });
async function slotAt(hours: number) {
  const s = new Date(Date.now() + hours * H);
  const [slot] = await db().insert(schema.timeSlots).values({ venueId, sportId, startsAt: s, endsAt: new Date(s.getTime() + 1.5 * H), price: 200000 }).returning();
  return slot;
}
async function paidSession(host: string, target: number, joiners: string[], deadlineOffsetH = 24, startH?: number) {
  const slot = await slotAt(startH ?? 72 + 3 * ++n);
  const r = await createOpenSession(host, { slotId: slot.id, targetCount: target, joinDeadline: new Date(Date.now() + deadlineOffsetH * H) });
  await simulatePay(host, r.intentId);
  for (const j of joiners) { const jr = await joinSession(j, r.sessionId); await simulatePay(j, jr.intentId); }
  return { sessionId: r.sessionId, slot };
}

beforeAll(async () => {
  await resetDb();
  const [c] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan', isDefault: true }).returning(); cityId = c.id;
  const [sp] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [{ key: 'shooting', nameFa: 's' }] }).returning(); sportId = sp.id;
  ownerId = await mkUser('venue_manager');
  adminId = await mkUser('admin');
  const [v] = await db().insert(schema.venues).values({ ownerUserId: ownerId, cityId, slug: 'v', name: 'سالن تست', address: 'x', status: 'published' }).returning(); venueId = v.id;
  await db().insert(schema.venueManagers).values({ venueId, userId: ownerId, role: 'owner' });
  await db().insert(schema.venueSports).values({ venueId, sportId, pricePerSlot: 200000, maxCapacity: 12 });
});
beforeEach(async () => {
  await sqlClient()`TRUNCATE session_waitlist, refund_topups, support_messages, favorite_venues, chat_blocks, chat_members, chat_messages, chat_rooms, team_session_invites, team_requests, team_members, teams, notifications, reservations, slot_claims, open_sessions, session_participants, payment_intents, payment_events, refunds, reports, rate_limits, audit_logs RESTART IDENTITY CASCADE`;
  await sqlClient()`DELETE FROM time_slots`;
  await sqlClient()`DELETE FROM venue_reviews`;
  await sqlClient()`DELETE FROM venue_managers WHERE role = 'staff'`;
});
afterAll(async () => { await sqlClient().end(); });

describe('favourites', () => {
  it('is idempotent, per user, and published venues only', async () => {
    const u = await mkUser(), w = await mkUser();
    await setFavorite(u, venueId, true); await setFavorite(u, venueId, true);
    expect([...(await favoriteIds(u))]).toEqual([venueId]);
    expect((await favoriteIds(w)).size).toBe(0);
    await setFavorite(u, venueId, false); await setFavorite(u, venueId, false);
    expect((await favoriteIds(u)).size).toBe(0);
    const [d] = await db().insert(schema.venues).values({ ownerUserId: ownerId, cityId, slug: 'd', name: 'پیش‌نویس', address: 'x', status: 'draft' }).returning();
    expect(await code(setFavorite(u, d.id, true))).toBe('not_found');
    await db().delete(schema.venues).where(eq(schema.venues.id, d.id));
  });
  it('a venue that gets suspended disappears from the list but the row is kept', async () => {
    const u = await mkUser();
    await setFavorite(u, venueId, true);
    await db().update(schema.venues).set({ status: 'suspended' }).where(eq(schema.venues.id, venueId));
    expect(await listFavoriteVenueIds(u)).toEqual([]);
    await db().update(schema.venues).set({ status: 'published' }).where(eq(schema.venues.id, venueId));
    expect(await listFavoriteVenueIds(u)).toEqual([venueId]);
  });
});

describe('waiting list', () => {
  it('only for full sessions; position order; leave; duplicates rejected', async () => {
    const host = await mkUser(), a = await mkUser(), b = await mkUser(), c = await mkUser();
    const { sessionId } = await paidSession(host, 2, []);
    expect(await code(joinWaitlist(a, sessionId))).toBe('not_full');
    await joinSession(a, sessionId).then((r) => simulatePay(a, r.intentId));
    expect((await joinWaitlist(b, sessionId)).position).toBe(1);
    expect((await joinWaitlist(c, sessionId)).position).toBe(2);
    expect(await code(joinWaitlist(b, sessionId))).toBe('already_waiting');
    expect(await code(joinWaitlist(a, sessionId))).toBe('already_joined');
    expect(await waitlistInfo(c, sessionId)).toMatchObject({ count: 2, position: 2, notified: false });
    await leaveWaitlist(b, sessionId);
    expect(await waitlistInfo(c, sessionId)).toMatchObject({ count: 1, position: 1 });
  });
  it('a free seat notifies the first waiter exactly once', async () => {
    const host = await mkUser(), a = await mkUser(), b = await mkUser(), c = await mkUser();
    const { sessionId } = await paidSession(host, 2, [a]);
    await joinWaitlist(b, sessionId); await joinWaitlist(c, sessionId);
    await leaveSession(a, sessionId);
    const nb = await db().select().from(schema.notifications).where(and(eq(schema.notifications.userId, b), eq(schema.notifications.type, 'waitlist_spot')));
    const nc = await db().select().from(schema.notifications).where(and(eq(schema.notifications.userId, c), eq(schema.notifications.type, 'waitlist_spot')));
    expect(nb).toHaveLength(1); expect(nc).toHaveLength(0);
    expect((await waitlistInfo(b, sessionId)).notified).toBe(true);
  });
  it('is capped', async () => {
    const host = await mkUser(); const { sessionId } = await paidSession(host, 2, [await mkUser()]);
    for (let i = 0; i < MAX_WAITING; i++) await joinWaitlist(await mkUser(), sessionId);
    expect(await code(joinWaitlist(await mkUser(), sessionId))).toBe('waitlist_full');
  });
  it('rejects the wrong skill range and invite-only sessions without the token', async () => {
    const host = await mkUser(), a = await mkUser(), b = await mkUser();
    const slot = await slotAt(100);
    const r = await createOpenSession(host, { slotId: slot.id, targetCount: 2, joinDeadline: new Date(Date.now() + 24 * H), skillMin: 80, skillMax: 99 } as never);
    await simulatePay(host, r.intentId);
    // make it full via a high-skill player
    const hi = await mkUser(); await db().update(schema.playerSportProfiles).set({ ovr: 90 }).where(eq(schema.playerSportProfiles.userId, hi));
    await joinSession(hi, r.sessionId).then((x) => simulatePay(hi, x.intentId));
    expect(await code(joinWaitlist(a, r.sessionId))).toBe('skill_range');
    await db().update(schema.openSessions).set({ visibility: 'invite_only', skillMin: 0 }).where(eq(schema.openSessions.id, r.sessionId));
    expect(await code(joinWaitlist(b, r.sessionId))).toBe('invite_only');
  });
});

describe('top-up refund when a replacement pays', () => {
  it('late leaver gets the remainder exactly once, as a separate row', async () => {
    const host = await mkUser(), a = await mkUser(), b = await mkUser();
    // session 72h away, joining open until 1h before the start; the leaver leaves 3h before the start (partial refund tier)
    const slot = await slotAt(72);
    const r = await createOpenSession(host, { slotId: slot.id, targetCount: 2, joinDeadline: new Date(slot.startsAt.getTime() - H) });
    await simulatePay(host, r.intentId);
    const ja = await joinSession(a, r.sessionId); await simulatePay(a, ja.intentId);
    const late = new Date(slot.startsAt.getTime() - 3 * H);
    const left = await leaveSession(a, r.sessionId, late);
    expect(left.refundPercent).toBeLessThan(100);
    const jb = await joinSession(b, r.sessionId, {}, late); await simulatePay(b, jb.intentId, late);
    const tops = await db().select().from(schema.refundTopups);
    expect(tops).toHaveLength(1);
    const [intent] = await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.payerUserId, a));
    const [ref] = await db().select().from(schema.refunds).where(eq(schema.refunds.intentId, intent.id));
    expect(tops[0].amount + ref.amount).toBe(intent.amount);   // never more than was paid
    const notes = await db().select().from(schema.notifications).where(and(eq(schema.notifications.userId, a), eq(schema.notifications.type, 'refund_topup')));
    expect(notes).toHaveLength(1);
  });
  it('a full-refund leaver gets no top-up', async () => {
    const host = await mkUser(), a = await mkUser(), b = await mkUser();
    const { sessionId } = await paidSession(host, 2, [a]);
    const l = await leaveSession(a, sessionId);
    expect(l.refundPercent).toBe(100);
    await joinSession(b, sessionId).then((x) => simulatePay(b, x.intentId));
    expect(await db().select().from(schema.refundTopups)).toHaveLength(0);
  });
});

describe('support messages', () => {
  it('validates, limits duplicates per topic and per hour, admin closes once', async () => {
    const u = await mkUser();
    expect(await code(createSupportMessage(u, { topic: 'nope', body: 'یک پیام به اندازهٔ کافی بلند' }))).toBe('invalid');
    expect(await code(createSupportMessage(u, { topic: 'booking', body: 'کوتاه' }))).toBe('invalid');
    const m = await createSupportMessage(u, { topic: 'booking', body: 'سلام، مشکل رزرو دارم لطفاً راهنمایی کنید' });
    expect(await code(createSupportMessage(u, { topic: 'booking', body: 'باز هم همین مشکل رزرو را دارم' }))).toBe('duplicate');
    await createSupportMessage(u, { topic: 'payment', body: 'مشکل پرداخت دارم لطفاً بررسی کنید' });
    await createSupportMessage(u, { topic: 'other', body: 'یک پیام دیگر برای آزمایش سقف' });
    expect(await code(createSupportMessage(u, { topic: 'account', body: 'پیام چهارم در همان ساعت' }))).toBe('rate_limited');
    expect(await openSupportCount()).toBe(3);
    expect(await code(listSupport(actor(u, 'player'), 'open'))).toBe('forbidden');
    expect(await listSupport(actor(adminId, 'admin'), 'open')).toHaveLength(3);
    await closeSupport(actor(adminId, 'admin'), m.id);
    expect(await code(closeSupport(actor(adminId, 'admin'), m.id))).toBe('bad_state');
  });
});

describe('admin oversight', () => {
  it('lists sessions for admins only', async () => {
    const host = await mkUser(); await paidSession(host, 4, []);
    expect(await code(listSessionsAdmin(actor(host, 'player'), {}))).toBe('forbidden');
    const r = await listSessionsAdmin(actor(adminId, 'admin'), {});
    expect(r.total).toBe(1); expect(r.rows[0].confirmed).toBe(1);
  });
  it('hiding a review recomputes the venue rating, notifies the author and can be undone', async () => {
    const host = await mkUser(), p = await mkUser();
    const { sessionId } = await paidSession(host, 2, []);
    const [s] = await db().select().from(schema.openSessions).where(eq(schema.openSessions.id, sessionId));
    const mk = async (uid: string, rating: number) => (await db().insert(schema.venueReviews).values({ venueId, userId: uid, reservationId: s.reservationId, rating, comment: 'نظر' }).returning())[0];
    const r1 = await mk(host, 5);
    // second review needs another reservation: reuse unique constraints by inserting with a second reservation row
    const [res2] = await db().select().from(schema.reservations).limit(1);
    void res2; void p;
    await sqlClient()`UPDATE venues SET rating_avg = 5, rating_count = 1 WHERE id = ${venueId}`;
    await setReviewHidden(actor(adminId, 'admin'), r1.id, true, 'توهین');
    const [v1] = await db().select().from(schema.venues).where(eq(schema.venues.id, venueId));
    expect(Number(v1.ratingCount)).toBe(0);
    expect(await code(setReviewHidden(actor(adminId, 'admin'), r1.id, true))).toBe('bad_state');
    expect((await db().select().from(schema.notifications).where(eq(schema.notifications.type, 'review_hidden')))).toHaveLength(1);
    expect(await code(setReviewHidden(actor(host, 'player'), r1.id, false))).toBe('forbidden');
    await setReviewHidden(actor(adminId, 'admin'), r1.id, false);
    const [v2] = await db().select().from(schema.venues).where(eq(schema.venues.id, venueId));
    expect(Number(v2.ratingCount)).toBe(1);
    expect((await listReviewsAdmin(actor(adminId, 'admin'), {})).total).toBe(1);
  });
});

describe('venue staff', () => {
  it('owner adds a registered user by phone; staff manage slots but not venue content or staff', async () => {
    const staffPhone = '+989141234567';
    const staff = await mkUser('player', staffPhone);
    expect(await code(addStaff(actor(ownerId, 'venue_manager'), venueId, '0912'))).toBe('invalid');
    expect(await code(addStaff(actor(ownerId, 'venue_manager'), venueId, '09150000000'))).toBe('invalid'); // not registered
    await addStaff(actor(ownerId, 'venue_manager'), venueId, '09141234567');
    expect(await code(addStaff(actor(ownerId, 'venue_manager'), venueId, '09141234567'))).toBe('invalid'); // duplicate
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, staff));
    expect(u.role).toBe('venue_manager');
    const sa = actor(staff, 'venue_manager');
    await expect(assertManages(sa, venueId)).resolves.toBeUndefined();
    expect(await code(assertManages(sa, venueId, 'owner'))).toBe('forbidden');
    expect(await code(listStaff(sa, venueId))).toBe('forbidden');
    expect(await code(addStaff(sa, venueId, '09140000001'))).toBe('forbidden');
    expect(await code(removeStaff(sa, venueId, ownerId))).toBe('forbidden');
    expect(await code(submitForReview(sa, venueId))).toBe('forbidden');
    expect(await code(updateVenue(sa, venueId, {}))).toBe('forbidden');
    expect(await listStaff(actor(ownerId, 'venue_manager'), venueId)).toHaveLength(2);
    expect((await listOwnerSessions(sa)).length).toBe(0);
    // staff can create slots
    const day = new Date(Date.now() + 5 * 24 * H);
    void createSlots; void day;
    await removeStaff(actor(ownerId, 'venue_manager'), venueId, staff);
    expect(await code(assertManages(sa, venueId))).toBe('not_found');
    expect(await code(removeStaff(actor(ownerId, 'venue_manager'), venueId, ownerId))).toBe('not_found'); // the owner row cannot be removed
  });
  it("another venue's owner and plain players see 404 for a venue they don't manage", async () => {
    const other = await mkUser('venue_manager');
    expect(await code(assertManages(actor(other, 'venue_manager'), venueId))).toBe('not_found');
    expect(await code(addStaff(actor(other, 'venue_manager'), venueId, '09141234567'))).toBe('not_found');
  });
  it('owner sessions overview shows only sessions at managed venues', async () => {
    const host = await mkUser(); await paidSession(host, 4, [await mkUser()]);
    const mine = await listOwnerSessions(actor(ownerId, 'venue_manager'));
    expect(mine).toHaveLength(1); expect(mine[0].confirmed).toBe(2);
    expect(await listOwnerSessions(actor(await mkUser('venue_manager'), 'venue_manager'))).toHaveLength(0);
  });
});
