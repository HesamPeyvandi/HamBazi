/**
 * Phase 6 — text chat. ISOLATED MODULE: nothing outside src/server/messaging, src/app/chat, src/app/api/chat and
 * src/components/chat depends on it except three thin touch-points (entry buttons, the 'message' report type and the
 * retention call in the sweeper). Removing the module = deleting those folders + dropping the four chat_* tables.
 *
 * Rules
 *  - Rooms: one per open session, one per team. Created lazily by a member.
 *  - Membership is derived at read time (session_participants confirmed/attended, team_members of an active team);
 *    leaving a session/team revokes access immediately. Anyone else gets 404 (never 403) so room ids leak nothing.
 *  - Write access needs the session to be collecting/confirmed (read-only afterwards) or an active team.
 *  - Text only. Body is normalised (control and bidi-override characters stripped), 1..1000 characters, stored raw and
 *    escaped at render time (React). No HTML, no links are made clickable.
 *  - Per-user rate limit (6 / 10 s and 60 / 10 min) and a poll limit (120 / min).
 *  - Cursor = `seq`. Sends lock the room row, so within a room seq order == commit order: a poller can never skip a message.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { audit } from '@/server/audit';
import { DomainError, E } from '@/server/booking/errors';
import { type Db, type Tx } from '@/server/booking/core';
import { createReport } from '@/server/trust/reports';
import { rateLimit } from '@/server/ratelimit';

export const MAX_MESSAGE_LENGTH = 1000;
export const PAGE_SIZE = 50;
export const RETENTION_DAYS = 90;
export const SEND_LIMITS = { burst: { n: 6, seconds: 10 }, sustained: { n: 60, seconds: 600 } } as const;
export const POLL_LIMIT = { n: 120, seconds: 60 } as const;
const LIVE_SESSION = ['collecting', 'confirmed'] as const;
const MEMBER_STATUSES = ['confirmed', 'attended'] as const;

export type RoomKind = 'session' | 'team';
type Q = Db | Tx;

export interface Access {
  roomId: string; kind: RoomKind; refId: string; title: string; subtitle: string; href: string;
  canWrite: boolean; memberCount: number;
}
export interface MessageDTO {
  seq: number; id: string; senderId: string; senderName: string; senderAvatar: string | null;
  body: string; hidden: boolean; createdAt: string; mine: boolean;
}

/* ---------------------------------------------------------------- text */

/** Pure. Returns the cleaned body or throws a Persian DomainError. */
export function normalizeBody(raw: unknown): string {
  if (typeof raw !== 'string') throw E.invalid('متن پیام معتبر نیست.');
  let s = raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n');
  // control chars (keep \n), bidi embedding/override/isolate controls (text-spoofing), zero-width space / BOM
  s = s.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\u200B\uFEFF]/g, '');
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const len = [...s].length;
  if (len === 0) throw E.invalid('پیام خالی است.');
  if (len > MAX_MESSAGE_LENGTH) throw E.invalid(`پیام حداکثر ${MAX_MESSAGE_LENGTH} نویسه می‌تواند باشد.`);
  return s;
}

/* ---------------------------------------------------------------- access */

/** The single authorisation point of the module. Returns null for non-members (callers answer 404). */
export async function getAccess(q: Q, userId: string, roomId: string): Promise<Access | null> {
  const [room] = await q.select().from(schema.chatRooms).where(eq(schema.chatRooms.id, roomId));
  if (!room) return null;
  if (room.kind === 'session' && room.sessionId) return sessionAccess(q, userId, room.id, room.sessionId);
  if (room.kind === 'team' && room.teamId) return teamAccess(q, userId, room.id, room.teamId);
  return null;
}

async function sessionAccess(q: Q, userId: string, roomId: string, sessionId: string): Promise<Access | null> {
  const [r] = await q.select({ status: schema.openSessions.status, venue: schema.venues.name, sport: schema.sports.nameFa, startsAt: schema.timeSlots.startsAt })
    .from(schema.openSessions)
    .innerJoin(schema.sessionParticipants, and(eq(schema.sessionParticipants.sessionId, schema.openSessions.id), eq(schema.sessionParticipants.userId, userId), inArray(schema.sessionParticipants.status, [...MEMBER_STATUSES])))
    .innerJoin(schema.venues, eq(schema.venues.id, schema.openSessions.venueId))
    .innerJoin(schema.sports, eq(schema.sports.id, schema.openSessions.sportId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.openSessions.slotId))
    .where(eq(schema.openSessions.id, sessionId));
  if (!r) return null;
  const [{ n }] = await q.select({ n: sql<number>`count(*)::int` }).from(schema.sessionParticipants)
    .where(and(eq(schema.sessionParticipants.sessionId, sessionId), inArray(schema.sessionParticipants.status, [...MEMBER_STATUSES])));
  return {
    roomId, kind: 'session', refId: sessionId, title: `${r.sport} · ${r.venue}`, subtitle: r.startsAt.toISOString(), href: `/sessions/${sessionId}`,
    canWrite: (LIVE_SESSION as readonly string[]).includes(r.status), memberCount: n,
  };
}

async function teamAccess(q: Q, userId: string, roomId: string, teamId: string): Promise<Access | null> {
  const [r] = await q.select({ name: schema.teams.name }).from(schema.teams)
    .innerJoin(schema.teamMembers, and(eq(schema.teamMembers.teamId, schema.teams.id), eq(schema.teamMembers.userId, userId)))
    .where(and(eq(schema.teams.id, teamId), eq(schema.teams.status, 'active')));
  if (!r) return null;
  const [{ n }] = await q.select({ n: sql<number>`count(*)::int` }).from(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId));
  return { roomId, kind: 'team', refId: teamId, title: `تیم ${r.name}`, subtitle: '', href: `/teams/${teamId}`, canWrite: true, memberCount: n };
}

export async function requireAccess(userId: string, roomId: string): Promise<Access> {
  const a = await getAccess(db(), userId, roomId);
  if (!a) throw E.notFound();
  return a;
}

/** Lazily creates the room for a session/team the user belongs to. Non-members: not_found. Idempotent. */
export async function ensureRoom(userId: string, kind: RoomKind, refId: string): Promise<string> {
  const d = db();
  const col = kind === 'session' ? schema.chatRooms.sessionId : schema.chatRooms.teamId;
  const [existing] = await d.select({ id: schema.chatRooms.id }).from(schema.chatRooms).where(eq(col, refId));
  let roomId = existing?.id;
  if (!roomId) {
    // membership must hold BEFORE the room is created, so probing ids creates nothing
    const ok = kind === 'session' ? await sessionAccess(d, userId, '', refId) : await teamAccess(d, userId, '', refId);
    if (!ok) throw E.notFound();
    const [row] = await d.insert(schema.chatRooms).values(kind === 'session' ? { kind, sessionId: refId } : { kind, teamId: refId }).onConflictDoNothing().returning({ id: schema.chatRooms.id });
    roomId = row?.id ?? (await d.select({ id: schema.chatRooms.id }).from(schema.chatRooms).where(eq(col, refId)))[0].id;
  }
  await requireAccess(userId, roomId);
  return roomId;
}

/* ---------------------------------------------------------------- reading */

// NB: drizzle's postgres.js client returns timestamps as strings even for raw queries, hence the `Ts` unions + iso().
type Ts = Date | string;
const iso = (t: Ts) => new Date(t).toISOString();
interface Row { seq: number; id: string; sender_id: string; name: string | null; avatar: string | null; body: string; created_at: Ts; hidden_at: Ts | null }
const toDTO = (r: Row, me: string): MessageDTO => ({
  seq: Number(r.seq), id: r.id, senderId: r.sender_id, senderName: r.name || 'کاربر', senderAvatar: r.avatar,
  body: r.hidden_at ? '' : r.body, hidden: !!r.hidden_at, createdAt: iso(r.created_at), mine: r.sender_id === me,
});

/**
 * `after`: messages with seq > after, oldest first (polling). `before`: older page, newest page when omitted.
 * Messages from users the caller blocked in this room are filtered out at the query level.
 */
export async function getMessages(userId: string, roomId: string, opts: { after?: number; before?: number; limit?: number; markRead?: boolean } = {}) {
  const access = await requireAccess(userId, roomId);
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? PAGE_SIZE), 1), 100);
  const sql_ = sqlClient();
  const blocked = sql_`NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.room_id = m.room_id AND b.blocker_id = ${userId} AND b.blocked_id = m.sender_id)`;
  let rows: Row[];
  let hasMore = false;
  if (opts.after !== undefined) {
    rows = await sql_<Row[]>`
      SELECT m.seq, m.id, m.sender_id, u.display_name AS name, u.avatar_url AS avatar, m.body, m.created_at, m.hidden_at
      FROM chat_messages m JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = ${roomId} AND m.seq > ${opts.after} AND ${blocked} ORDER BY m.seq ASC LIMIT ${limit}`;
  } else {
    const got = await sql_<Row[]>`
      SELECT m.seq, m.id, m.sender_id, u.display_name AS name, u.avatar_url AS avatar, m.body, m.created_at, m.hidden_at
      FROM chat_messages m JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = ${roomId} ${opts.before !== undefined ? sql_`AND m.seq < ${opts.before}` : sql_``} AND ${blocked}
      ORDER BY m.seq DESC LIMIT ${limit + 1}`;
    hasMore = got.length > limit;
    rows = got.slice(0, limit).reverse();
  }
  const messages = rows.map((r) => toDTO(r, userId));
  const last = rows.length ? Number(rows[rows.length - 1].seq) : 0;
  if (opts.markRead && last && opts.before === undefined) await markRead(userId, roomId, last);
  return { access, messages, hasMore, lastSeq: last };
}

export async function markRead(userId: string, roomId: string, seq: number) {
  await sqlClient()`
    INSERT INTO chat_members (room_id, user_id, last_read_seq) VALUES (${roomId}, ${userId}, ${seq})
    ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_seq = GREATEST(chat_members.last_read_seq, EXCLUDED.last_read_seq)`;
  // opening a room clears its "new message" notification
  await sqlClient()`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND type = 'chat_message' AND link = ${'/chat/' + roomId} AND read_at IS NULL`;
}

export async function checkPollLimit(userId: string) {
  const r = await rateLimit(`chat:poll:${userId}`, POLL_LIMIT.n, POLL_LIMIT.seconds);
  if (!r.allowed) throw new DomainError('rate_limited', 'درخواست‌ها بیش از حد است. چند لحظه صبر کنید.');
}

/* ---------------------------------------------------------------- sending */

export async function sendMessage(userId: string, roomId: string, rawBody: unknown): Promise<MessageDTO> {
  const body = normalizeBody(rawBody);
  const pre = await requireAccess(userId, roomId);
  if (!pre.canWrite) throw new DomainError('read_only', 'این گفت‌وگو فقط‌خواندنی است.');
  const burst = await rateLimit(`chat:send10:${userId}`, SEND_LIMITS.burst.n, SEND_LIMITS.burst.seconds);
  const slow = await rateLimit(`chat:send600:${userId}`, SEND_LIMITS.sustained.n, SEND_LIMITS.sustained.seconds);
  if (!burst.allowed || !slow.allowed) throw new DomainError('rate_limited', 'پیام‌ها خیلی سریع ارسال می‌شوند. چند لحظه صبر کنید.');

  return db().transaction(async (tx) => {
    // Serialise senders of this room: seq order == commit order (see header comment).
    const [locked] = await tx.select({ id: schema.chatRooms.id }).from(schema.chatRooms).where(eq(schema.chatRooms.id, roomId)).for('update');
    if (!locked) throw E.notFound();
    const access = await getAccess(tx, userId, roomId); // re-check inside the lock: membership may have just been revoked
    if (!access) throw E.notFound();
    if (!access.canWrite) throw new DomainError('read_only', 'این گفت‌وگو فقط‌خواندنی است.');
    const [m] = await tx.insert(schema.chatMessages).values({ roomId, senderId: userId, body }).returning();
    await tx.update(schema.chatRooms).set({ lastMessageAt: m.createdAt }).where(eq(schema.chatRooms.id, roomId));
    await tx.execute(sql`
      INSERT INTO chat_members (room_id, user_id, last_read_seq) VALUES (${roomId}, ${userId}, ${m.seq})
      ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_seq = GREATEST(chat_members.last_read_seq, EXCLUDED.last_read_seq)`);
    const [u] = await tx.select({ name: schema.users.displayName, avatar: schema.users.avatarUrl }).from(schema.users).where(eq(schema.users.id, userId));
    await fanOut(tx, access, userId, u?.name || 'کاربر', body);
    return { seq: m.seq, id: m.id, senderId: userId, senderName: u?.name || 'کاربر', senderAvatar: u?.avatar ?? null, body, hidden: false, createdAt: m.createdAt.toISOString(), mine: true };
  });
}

/**
 * One set-based statement. At most ONE unread "new message" notification per (user, room) — a busy chat never floods the
 * bell. Skips the sender, muted members, members who blocked the sender, and members who switched the `chat` group off.
 */
async function fanOut(tx: Tx, a: Access, senderId: string, senderName: string, body: string) {
  const link = `/chat/${a.roomId}`;
  const preview = [...body.replace(/\s+/g, ' ')].slice(0, 80).join('');
  const members = a.kind === 'session'
    ? sql`SELECT sp.user_id FROM session_participants sp WHERE sp.session_id = ${a.refId} AND sp.status IN ('confirmed','attended')`
    : sql`SELECT tm.user_id FROM team_members tm WHERE tm.team_id = ${a.refId}`;
  await tx.execute(sql`
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT m.user_id, 'chat_message', ${'پیام جدید در ' + a.title}, ${`${senderName}: ${preview}`}, ${link}
    FROM (${members}) m
    LEFT JOIN user_profiles up ON up.user_id = m.user_id
    LEFT JOIN chat_members cm ON cm.room_id = ${a.roomId} AND cm.user_id = m.user_id
    JOIN users u ON u.id = m.user_id AND u.status = 'active'
    WHERE m.user_id <> ${senderId}
      AND COALESCE(cm.muted, false) = false
      AND COALESCE(up.notif_prefs ->> 'chat', 'true') <> 'false'
      AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.room_id = ${a.roomId} AND b.blocker_id = m.user_id AND b.blocked_id = ${senderId})
      AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = m.user_id AND n.type = 'chat_message' AND n.link = ${link} AND n.read_at IS NULL)`);
}

/* ---------------------------------------------------------------- room list / unread */

export interface RoomListItem {
  roomId: string | null; kind: RoomKind; refId: string; title: string; subtitle: string; href: string;
  lastMessageAt: string | null; lastBody: string | null; lastSender: string | null; unread: number; muted: boolean; canWrite: boolean;
}

/** Every session/team the user can chat in (room may not exist yet), newest activity first. */
export async function listRooms(userId: string): Promise<RoomListItem[]> {
  const s = sqlClient();
  type R = { room_id: string | null; kind: RoomKind; ref_id: string; title: string; starts_at: Ts | null; last_at: Ts | null; last_body: string | null; last_sender: string | null; unread: number; muted: boolean | null; can_write: boolean };
  const rows = await s<R[]>`
    WITH mine AS (
      SELECT 'session'::text AS kind, os.id AS ref_id, (sp2.name_fa || ' · ' || v.name) AS title, ts.starts_at, (os.status IN ('collecting','confirmed')) AS can_write, os.created_at
      FROM session_participants sp
      JOIN open_sessions os ON os.id = sp.session_id
      JOIN venues v ON v.id = os.venue_id
      JOIN sports sp2 ON sp2.id = os.sport_id
      JOIN time_slots ts ON ts.id = os.slot_id
      WHERE sp.user_id = ${userId} AND sp.status IN ('confirmed','attended')
      UNION ALL
      SELECT 'team', t.id, ('تیم ' || t.name), NULL, true, t.created_at
      FROM team_members tm JOIN teams t ON t.id = tm.team_id AND t.status = 'active' WHERE tm.user_id = ${userId}
    )
    SELECT r.id AS room_id, mine.kind, mine.ref_id, mine.title, mine.starts_at, r.last_message_at AS last_at, mine.can_write, cm.muted,
      lm.body AS last_body, lm.hidden_at IS NOT NULL AS last_hidden, lu.display_name AS last_sender,
      COALESCE((SELECT count(*) FROM chat_messages m WHERE m.room_id = r.id AND m.seq > COALESCE(cm.last_read_seq, 0) AND m.sender_id <> ${userId} AND m.hidden_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.room_id = m.room_id AND b.blocker_id = ${userId} AND b.blocked_id = m.sender_id)), 0)::int AS unread
    FROM mine
    LEFT JOIN chat_rooms r ON (mine.kind = 'session' AND r.session_id = mine.ref_id) OR (mine.kind = 'team' AND r.team_id = mine.ref_id)
    LEFT JOIN chat_members cm ON cm.room_id = r.id AND cm.user_id = ${userId}
    LEFT JOIN LATERAL (SELECT m.body, m.sender_id, m.hidden_at FROM chat_messages m WHERE m.room_id = r.id
      AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.room_id = m.room_id AND b.blocker_id = ${userId} AND b.blocked_id = m.sender_id)
      ORDER BY m.seq DESC LIMIT 1) lm ON true
    LEFT JOIN users lu ON lu.id = lm.sender_id
    WHERE mine.kind = 'team' OR mine.can_write OR r.last_message_at IS NOT NULL
    ORDER BY COALESCE(r.last_message_at, mine.created_at) DESC
    LIMIT 100` as unknown as (R & { last_hidden: boolean })[];
  return (rows as (R & { last_hidden: boolean })[]).map((r) => ({
    roomId: r.room_id, kind: r.kind, refId: r.ref_id, title: r.title, subtitle: r.starts_at ? iso(r.starts_at) : '',
    href: r.room_id ? `/chat/${r.room_id}` : `/chat/${r.kind}/${r.ref_id}`,
    lastMessageAt: r.last_at ? iso(r.last_at) : null, lastBody: r.last_body == null ? null : r.last_hidden ? 'پیام حذف شد' : r.last_body,
    lastSender: r.last_sender, unread: r.unread, muted: !!r.muted, canWrite: r.can_write,
  }));
}

/* ---------------------------------------------------------------- per-room user settings */

export async function setMuted(userId: string, roomId: string, muted: boolean) {
  await requireAccess(userId, roomId);
  await sqlClient()`INSERT INTO chat_members (room_id, user_id, muted) VALUES (${roomId}, ${userId}, ${muted})
    ON CONFLICT (room_id, user_id) DO UPDATE SET muted = EXCLUDED.muted`;
}
export async function isMuted(userId: string, roomId: string) {
  const [r] = await db().select({ m: schema.chatMembers.muted }).from(schema.chatMembers).where(and(eq(schema.chatMembers.roomId, roomId), eq(schema.chatMembers.userId, userId)));
  return !!r?.m;
}

/** Blocking is per room, hides the target's messages from the blocker only, and the target is never notified. */
export async function setBlocked(userId: string, roomId: string, targetId: string, blocked: boolean) {
  if (userId === targetId) throw E.invalid('مسدود کردن خودتان ممکن نیست.');
  await requireAccess(userId, roomId);
  if (blocked) {
    // the target must have a link to this room (current member or past author), otherwise ids could be probed
    const [author] = await db().select({ id: schema.chatMessages.seq }).from(schema.chatMessages).where(and(eq(schema.chatMessages.roomId, roomId), eq(schema.chatMessages.senderId, targetId))).limit(1);
    if (!author && !(await getAccess(db(), targetId, roomId))) throw E.notFound();
    await db().insert(schema.chatBlocks).values({ roomId, blockerId: userId, blockedId: targetId }).onConflictDoNothing();
  } else {
    await db().delete(schema.chatBlocks).where(and(eq(schema.chatBlocks.roomId, roomId), eq(schema.chatBlocks.blockerId, userId), eq(schema.chatBlocks.blockedId, targetId)));
  }
}
export async function listBlocked(userId: string, roomId: string) {
  return db().select({ userId: schema.chatBlocks.blockedId, name: schema.users.displayName }).from(schema.chatBlocks)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatBlocks.blockedId))
    .where(and(eq(schema.chatBlocks.roomId, roomId), eq(schema.chatBlocks.blockerId, userId)));
}

/* ---------------------------------------------------------------- reporting & moderation */

/** Reporter must be able to read the room. A snapshot of the text is stored with the report (the message may be purged later). */
export async function reportMessage(reporterId: string, messageId: string, reason: string, details: string) {
  const [m] = await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.id, messageId));
  if (!m) throw E.notFound();
  if (!(await getAccess(db(), reporterId, m.roomId))) throw E.notFound();
  if (m.senderId === reporterId) throw E.invalid('گزارش دادن پیام خودتان ممکن نیست.');
  const snapshot = `«${[...m.body].slice(0, 300).join('')}»`;
  return createReport(reporterId, 'message', messageId, reason, `${snapshot}\n${details.trim()}`.slice(0, 1000));
}

/** Admin only (called from resolveReport). Hides the message text; the row stays for the audit trail. */
export async function hideMessage(tx: Tx, adminId: string, messageId: string) {
  const r = await tx.update(schema.chatMessages).set({ hiddenAt: new Date(), hiddenBy: adminId }).where(eq(schema.chatMessages.id, messageId)).returning({ id: schema.chatMessages.id });
  if (!r.length) throw E.notFound();
}
export async function messageSender(tx: Tx, messageId: string) {
  const [m] = await tx.select({ senderId: schema.chatMessages.senderId }).from(schema.chatMessages).where(eq(schema.chatMessages.id, messageId));
  return m?.senderId ?? null;
}

/* ---------------------------------------------------------------- retention */

/** Hard-deletes messages older than RETENTION_DAYS. Reports keep their own text snapshot. Idempotent. */
export async function purgeOldMessages(days = RETENTION_DAYS): Promise<number> {
  const r = await sqlClient()`DELETE FROM chat_messages WHERE created_at < now() - make_interval(days => ${days})`;
  if (r.count) await audit(null, 'chat.retention_purge', 'chat_messages', undefined, { deleted: r.count, days });
  return r.count;
}
