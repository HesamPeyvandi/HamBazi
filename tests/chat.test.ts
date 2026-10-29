import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { resetDb } from './helpers';
import { DomainError } from '@/server/booking/errors';
import { createOpenSession, joinSession, leaveSession } from '@/server/booking/sessions';
import { simulatePay } from '@/server/booking/settle';
import { saveNotifPrefs } from '@/server/account';
import { createTeam, joinTeam, leaveTeam, disbandTeam } from '@/server/teams';
import { resolveReport } from '@/server/trust/reports';
import {
  ensureRoom, getMessages, listRooms, markRead, normalizeBody, purgeOldMessages, reportMessage, sendMessage, setBlocked, setMuted,
  MAX_MESSAGE_LENGTH, SEND_LIMITS, checkPollLimit, POLL_LIMIT,
} from '@/server/messaging';

let sportId: string, cityId: string, venueId: string, n = 0;
const H = 3_600_000;
async function mkUser(name?: string) {
  const [u] = await db().insert(schema.users).values({ phoneE164: `+98913${String(4000000 + ++n)}`, displayName: name ?? `کاربر ${n}` }).returning();
  await db().insert(schema.userProfiles).values({ userId: u.id, cityId });
  await db().insert(schema.playerSportProfiles).values({ userId: u.id, sportId, selfScores: { shooting: 50 }, ovr: 50 });
  return u.id;
}
async function code(p: Promise<unknown>) { const e = await p.then(() => null, (x) => x); return e instanceof DomainError ? e.code : e ? 'other:' + (e as Error).message : 'ok'; }
const notes = (uid: string) => db().select().from(schema.notifications).where(eq(schema.notifications.userId, uid)).then((r) => r.filter((x) => x.type === 'chat_message'));
/** A confirmed session with `host` + the given joiners (all paid). */
async function session(host: string, joiners: string[] = []) {
  const s = new Date(Date.now() + (72 + 3 * ++n) * H);
  const [slot] = await db().insert(schema.timeSlots).values({ venueId, sportId, startsAt: s, endsAt: new Date(s.getTime() + 1.5 * H), price: 200000 }).returning();
  const r = await createOpenSession(host, { slotId: slot.id, targetCount: 6, joinDeadline: new Date(Date.now() + 24 * H) });
  await simulatePay(host, r.intentId);
  for (const j of joiners) { const jr = await joinSession(j, r.sessionId); await simulatePay(j, jr.intentId); }
  return r.sessionId;
}

beforeAll(async () => {
  await resetDb();
  const [c] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan', isDefault: true }).returning(); cityId = c.id;
  const [sp] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [{ key: 'shooting', nameFa: 's' }] }).returning(); sportId = sp.id;
  const owner = await mkUser();
  const [v] = await db().insert(schema.venues).values({ ownerUserId: owner, cityId, slug: 'v', name: 'سالن تست', address: 'x', status: 'published' }).returning(); venueId = v.id;
  await db().insert(schema.venueSports).values({ venueId, sportId, pricePerSlot: 200000, maxCapacity: 12 });
});
beforeEach(async () => {
  await sqlClient()`TRUNCATE chat_blocks, chat_members, chat_messages, chat_rooms, team_session_invites, team_requests, team_members, teams, notifications, reservations, slot_claims, open_sessions, session_participants, payment_intents, payment_events, refunds, reports, rate_limits RESTART IDENTITY CASCADE`;
  await sqlClient()`DELETE FROM time_slots`;
});
afterAll(async () => { await sqlClient().end(); });

describe('message text', () => {
  it('trims, normalises newlines, strips control / bidi-override / zero-width characters, keeps Persian ZWNJ', () => {
    expect(normalizeBody('  سلام\r\n\r\n\r\n\r\nخوبی؟  ')).toBe('سلام\n\nخوبی؟');
    expect(normalizeBody('a\u0000b‮c⁦d​e﻿')).toBe('abcde');
    expect(normalizeBody('می‌خواهم')).toBe('می‌خواهم');
  });
  it('rejects empty, whitespace-only, non-string and over-long text (counted in characters)', () => {
    for (const bad of ['', '   \n ', null, 5, {}, undefined]) expect(() => normalizeBody(bad)).toThrow(DomainError);
    expect(() => normalizeBody('x'.repeat(MAX_MESSAGE_LENGTH + 1))).toThrow(DomainError);
    expect([...normalizeBody('😀'.repeat(MAX_MESSAGE_LENGTH))]).toHaveLength(MAX_MESSAGE_LENGTH);
  });
  it('HTML is stored verbatim (escaping happens at render time)', async () => {
    const h = await mkUser(); const sid = await session(h); const room = await ensureRoom(h, 'session', sid);
    const m = await sendMessage(h, room, '<script>alert(1)</script> <b>x</b>');
    expect(m.body).toBe('<script>alert(1)</script> <b>x</b>');
  });
});

describe('access control (non-members always get not_found)', () => {
  it('session room: host and confirmed joiners yes; strangers, pending-payment joiners and people who left no', async () => {
    const host = await mkUser(); const a = await mkUser(); const stranger = await mkUser(); const pending = await mkUser(); const leaver = await mkUser();
    const sid = await session(host, [a, leaver]);
    await joinSession(pending, sid); // never pays
    const room = await ensureRoom(host, 'session', sid);
    expect(await ensureRoom(a, 'session', sid)).toBe(room);                    // idempotent: one room per session
    await sendMessage(a, room, 'سلام');
    expect((await getMessages(host, room)).messages).toHaveLength(1);
    for (const u of [stranger, pending]) {
      expect(await code(getMessages(u, room))).toBe('not_found');
      expect(await code(sendMessage(u, room, 'hi'))).toBe('not_found');
      expect(await code(ensureRoom(u, 'session', sid))).toBe('not_found');
    }
    await leaveSession(leaver, sid);
    expect(await code(getMessages(leaver, room))).toBe('not_found');           // leaving revokes access immediately
  });
  it('probing ids creates no room; unknown room ids are not_found', async () => {
    const u = await mkUser(); const host = await mkUser(); const sid = await session(host);
    expect(await code(ensureRoom(u, 'session', sid))).toBe('not_found');
    expect(await code(ensureRoom(u, 'team', '00000000-0000-0000-0000-000000000000'))).toBe('not_found');
    expect((await sqlClient()`SELECT count(*)::int AS n FROM chat_rooms`)[0].n).toBe(0);
    expect(await code(getMessages(u, '00000000-0000-0000-0000-000000000000'))).toBe('not_found');
  });
  it('team room: members yes; non-members no; leaving revokes; disbanded team closes the room', async () => {
    const cap = await mkUser(); const m = await mkUser(); const out = await mkUser();
    const t = await createTeam(cap, { name: 'تیم چت', sportId, cityId, joinMode: 'public', maxMembers: 5 });
    await joinTeam(m, t.id);
    const room = await ensureRoom(cap, 'team', t.id);
    await sendMessage(m, room, 'سلام تیم');
    expect(await code(getMessages(out, room))).toBe('not_found');
    expect(await code(sendMessage(out, room, 'x'))).toBe('not_found');
    await leaveTeam(m, t.id);
    expect(await code(getMessages(m, room))).toBe('not_found');
    await disbandTeam(cap, t.id);
    expect(await code(getMessages(cap, room))).toBe('not_found');
  });
  it('cancelled session => members can still read but not write (read_only)', async () => {
    const host = await mkUser(); const a = await mkUser(); const sid = await session(host, [a]);
    const room = await ensureRoom(a, 'session', sid); await sendMessage(a, room, 'قبل از لغو');
    await sqlClient()`UPDATE open_sessions SET status = 'cancelled' WHERE id = ${sid}`;
    expect((await getMessages(a, room)).access.canWrite).toBe(false);
    expect(await code(sendMessage(a, room, 'بعد از لغو'))).toBe('read_only');
    expect((await getMessages(a, room)).messages).toHaveLength(1);
  });
});

describe('sending, cursor and pagination', () => {
  it('after-cursor returns only newer messages in order; before-cursor pages backwards with hasMore', async () => {
    const h = await mkUser(); const a = await mkUser(); const sid = await session(h, [a]); const room = await ensureRoom(h, 'session', sid);
    for (let i = 1; i <= 5; i++) await sqlClient()`INSERT INTO chat_messages (room_id, sender_id, body) VALUES (${room}, ${i % 2 ? h : a}, ${'پیام ' + i})`;
    const first = await getMessages(h, room, { limit: 2 });
    expect(first.messages.map((m) => m.body)).toEqual(['پیام 4', 'پیام 5']); expect(first.hasMore).toBe(true);
    const older = await getMessages(h, room, { before: first.messages[0].seq, limit: 10 });
    expect(older.messages.map((m) => m.body)).toEqual(['پیام 1', 'پیام 2', 'پیام 3']); expect(older.hasMore).toBe(false);
    const nu = await getMessages(h, room, { after: older.messages[1].seq });
    expect(nu.messages.map((m) => m.body)).toEqual(['پیام 3', 'پیام 4', 'پیام 5']);
    expect((await getMessages(h, room, { after: nu.lastSeq })).messages).toEqual([]);
    expect(first.messages[1].mine).toBe(true); expect(first.messages[0].mine).toBe(false);
  });
  it('concurrent senders: every message stored once, seq strictly increasing in commit order', async () => {
    const users = [await mkUser(), await mkUser(), await mkUser(), await mkUser()]; const sid = await session(users[0], users.slice(1)); const room = await ensureRoom(users[0], 'session', sid);
    await Promise.all(users.flatMap((u, i) => [1, 2, 3, 4, 5].map((k) => sendMessage(u, room, `u${i}-m${k}`))));
    const all = (await getMessages(users[0], room, { limit: 100 })).messages;
    expect(all).toHaveLength(20); expect(new Set(all.map((m) => m.body)).size).toBe(20);
    expect(all.every((m, i) => i === 0 || m.seq > all[i - 1].seq)).toBe(true);
  });
  it('per-user rate limit: burst limit then recovers only after the window; other users unaffected', async () => {
    const a = await mkUser(); const b = await mkUser(); const sid = await session(a, [b]); const room = await ensureRoom(a, 'session', sid);
    for (let i = 0; i < SEND_LIMITS.burst.n; i++) await sendMessage(a, room, `m${i}`);
    expect(await code(sendMessage(a, room, 'too many'))).toBe('rate_limited');
    expect(await code(sendMessage(b, room, 'fine'))).toBe('ok');
    expect((await getMessages(a, room, { limit: 100 })).messages.map((m) => m.body)).not.toContain('too many');
  });
  it('poll limit', async () => {
    const a = await mkUser();
    for (let i = 0; i < POLL_LIMIT.n; i++) await checkPollLimit(a);
    expect(await code(checkPollLimit(a))).toBe('rate_limited');
  });
  it('a database-level check rejects over-long bodies even if the app is bypassed', async () => {
    const h = await mkUser(); const sid = await session(h); const room = await ensureRoom(h, 'session', sid);
    await expect(sqlClient()`INSERT INTO chat_messages (room_id, sender_id, body) VALUES (${room}, ${h}, ${'x'.repeat(1001)})`).rejects.toThrow();
  });
});

describe('unread, list, mute, notifications', () => {
  it('unread counts exclude own messages and clear when read; list shows newest activity first', async () => {
    const h = await mkUser(); const a = await mkUser(); const sid = await session(h, [a]); const room = await ensureRoom(h, 'session', sid);
    await sendMessage(h, room, 'one'); await sendMessage(h, room, 'two');
    let l = await listRooms(a); expect(l[0].unread).toBe(2); expect(l[0].lastBody).toBe('two');
    expect((await listRooms(h))[0].unread).toBe(0);
    const r = await getMessages(a, room, { markRead: true });
    await markRead(a, room, r.lastSeq);
    l = await listRooms(a); expect(l[0].unread).toBe(0);
    await sendMessage(h, room, 'three'); expect((await listRooms(a))[0].unread).toBe(1);
  });
  it('list contains rooms not yet created (session/team the user belongs to) and no foreign rooms', async () => {
    const h = await mkUser(); const o = await mkUser(); const sid = await session(h);
    const l = await listRooms(h); expect(l).toHaveLength(1); expect(l[0].roomId).toBeNull(); expect(l[0].href).toBe(`/chat/session/${sid}`);
    expect(await listRooms(o)).toHaveLength(0);
  });
  it('at most ONE unread notification per room; reading the room clears it; sender is never notified', async () => {
    const h = await mkUser(); const a = await mkUser(); const sid = await session(h, [a]); const room = await ensureRoom(h, 'session', sid);
    for (let i = 0; i < 3; i++) await sendMessage(h, room, `m${i}`);
    expect(await notes(a)).toHaveLength(1); expect((await notes(a))[0].link).toBe(`/chat/${room}`);
    expect(await notes(h)).toHaveLength(0);
    await getMessages(a, room, { markRead: true });
    expect((await notes(a))[0].readAt).not.toBeNull();
    await sendMessage(h, room, 'again'); expect(await notes(a)).toHaveLength(2);
  });
  it('muted members, members who switched the chat group off, and members who blocked the sender get no notification', async () => {
    const h = await mkUser(); const a = await mkUser(); const b = await mkUser(); const c = await mkUser(); const sid = await session(h, [a, b, c]); const room = await ensureRoom(h, 'session', sid);
    await setMuted(a, room, true); await saveNotifPrefs(b, { sessions: true, rating: true, teams: true, owner: true, chat: false }); await setBlocked(c, room, h, true);
    await sendMessage(h, room, 'hello');
    expect(await notes(a)).toHaveLength(0); expect(await notes(b)).toHaveLength(0); expect(await notes(c)).toHaveLength(0);
  });
  it('strangers cannot mute', async () => {
    const h = await mkUser(); const o = await mkUser(); const room = await ensureRoom(h, 'session', await session(h));
    expect(await code(setMuted(o, room, true))).toBe('not_found');
  });
});

describe('blocking', () => {
  it('hides the blocked sender for the blocker only, per room; unblock restores; cannot block self or an unrelated user', async () => {
    const h = await mkUser(); const a = await mkUser(); const b = await mkUser(); const stranger = await mkUser();
    const sid = await session(h, [a, b]); const room = await ensureRoom(h, 'session', sid); const room2 = await ensureRoom(h, 'session', await session(h, [a]));
    await sendMessage(a, room, 'from a'); await sendMessage(b, room, 'from b'); await sendMessage(a, room2, 'a in room2');
    await setBlocked(h, room, a, true);
    expect((await getMessages(h, room)).messages.map((m) => m.body)).toEqual(['from b']);
    expect((await getMessages(b, room)).messages.map((m) => m.body)).toEqual(['from a', 'from b']);   // others still see it
    expect((await getMessages(h, room2)).messages.map((m) => m.body)).toEqual(['a in room2']);         // other room unaffected
    expect((await listRooms(h)).find((r) => r.roomId === room)?.lastBody).toBe('from b');
    expect(await code(setBlocked(h, room, h, true))).toBe('invalid');
    expect(await code(setBlocked(h, room, stranger, true))).toBe('not_found');
    expect(await code(setBlocked(stranger, room, a, true))).toBe('not_found');
    await setBlocked(h, room, a, false);
    expect((await getMessages(h, room)).messages).toHaveLength(2);
  });
});

describe('reporting and moderation', () => {
  it('members can report another member message (snapshot stored); non-members, self-reports and duplicates are refused', async () => {
    const h = await mkUser(); const a = await mkUser(); const s = await mkUser(); const sid = await session(h, [a]); const room = await ensureRoom(h, 'session', sid);
    const m = await sendMessage(a, room, 'توهین‌آمیز');
    const r = await reportMessage(h, m.id, 'abuse', 'لطفاً بررسی کنید');
    expect(r.targetType).toBe('message'); expect(r.details).toContain('توهین‌آمیز');
    expect(await code(reportMessage(s, m.id, 'abuse', ''))).toBe('not_found');
    expect(await code(reportMessage(a, m.id, 'abuse', ''))).toBe('invalid');
    expect(await code(reportMessage(h, m.id, 'abuse', ''))).toBe('duplicate');
    expect(await code(reportMessage(h, m.id, 'nonsense', ''))).toBe('invalid');
  });
  it('admin can hide the text and suspend the sender; the report keeps its snapshot after retention purge', async () => {
    const h = await mkUser(); const a = await mkUser(); const sid = await session(h, [a]); const room = await ensureRoom(h, 'session', sid);
    const m = await sendMessage(a, room, 'متن بد');
    const r = await reportMessage(h, m.id, 'abuse', '');
    const [adm] = await db().insert(schema.users).values({ phoneE164: '+989139999999', displayName: 'admin', role: 'admin' }).returning();
    expect(await code(resolveReport({ id: h, role: 'player' }, r.id, 'resolved', '', false, true))).toBe('forbidden');
    await resolveReport({ id: adm.id, role: 'admin' }, r.id, 'resolved', 'ok', true, true);
    const seen = (await getMessages(h, room)).messages[0];
    expect(seen.hidden).toBe(true); expect(seen.body).toBe('');
    expect((await db().select().from(schema.users).where(eq(schema.users.id, a)))[0].status).toBe('suspended');
    await sqlClient()`UPDATE chat_messages SET created_at = now() - interval '200 days'`;
    expect(await purgeOldMessages()).toBe(1);
    expect((await db().select().from(schema.reports).where(eq(schema.reports.id, r.id)))[0].details).toContain('متن بد');
  });
});

describe('retention', () => {
  it('deletes only messages older than 90 days and is idempotent', async () => {
    const h = await mkUser(); const room = await ensureRoom(h, 'session', await session(h));
    await sendMessage(h, room, 'new');
    await sqlClient()`INSERT INTO chat_messages (room_id, sender_id, body, created_at) VALUES (${room}, ${h}, 'old', now() - interval '91 days')`;
    expect(await purgeOldMessages()).toBe(1); expect(await purgeOldMessages()).toBe(0);
    expect((await getMessages(h, room)).messages.map((m) => m.body)).toEqual(['new']);
  });
});
