import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, ilike, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { notify, type Tx } from '@/server/booking/core';
import { DomainError, E } from '@/server/booking/errors';

export const MAX_TEAMS_PER_USER = 5;
export const MAX_PENDING_REQUESTS = 10;
export const JOIN_MODES = { public: 'عمومی — هر کسی بلافاصله می‌پیوندد', request: 'با درخواست — کاپیتان تأیید می‌کند', invite_only: 'فقط با لینک دعوت' } as const;
export type JoinMode = keyof typeof JOIN_MODES;

const teamInput = z.object({
  name: z.string().trim().min(3, 'نام تیم حداقل ۳ حرف باشد.').max(40, 'نام تیم حداکثر ۴۰ حرف باشد.'),
  sportId: z.string().uuid(), cityId: z.string().uuid(),
  description: z.string().trim().max(400, 'توضیحات حداکثر ۴۰۰ حرف باشد.').default(''),
  joinMode: z.enum(['public', 'request', 'invite_only']).default('request'),
  maxMembers: z.number().int().min(2, 'ظرفیت تیم حداقل ۲ نفر است.').max(50, 'ظرفیت تیم حداکثر ۵۰ نفر است.').default(20),
});
const parse = (raw: unknown) => { const r = teamInput.safeParse(raw); if (!r.success) throw E.invalid(r.error.issues[0]?.message); return r.data; };
const token = () => randomBytes(12).toString('base64url');

async function activeTeamCount(tx: Tx | ReturnType<typeof db>, userId: string) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.teamMembers).innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teams.status, 'active')));
  return n;
}
async function lockTeam(tx: Tx, teamId: string) {
  const [t] = await tx.select().from(schema.teams).where(and(eq(schema.teams.id, teamId), eq(schema.teams.status, 'active'))).for('update');
  if (!t) throw E.notFound();
  return t;
}
const members = (tx: Tx, teamId: string) => tx.select().from(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId));
async function addMember(tx: Tx, team: typeof schema.teams.$inferSelect, userId: string) {
  const ms = await members(tx, team.id);
  if (ms.some((m) => m.userId === userId)) throw new DomainError('already_member', 'شما قبلاً عضو این تیم هستید.');
  if (ms.length >= team.maxMembers) throw new DomainError('team_full', 'ظرفیت این تیم تکمیل شده است.');
  if ((await activeTeamCount(tx, userId)) >= MAX_TEAMS_PER_USER) throw new DomainError('team_limit', `هر نفر حداکثر عضو ${MAX_TEAMS_PER_USER} تیم می‌تواند باشد.`);
  await tx.insert(schema.teamMembers).values({ teamId: team.id, userId, role: 'member' });
}

export async function createTeam(userId: string, raw: unknown) {
  const i = parse(raw);
  try {
    return await db().transaction(async (tx) => {
      if ((await activeTeamCount(tx, userId)) >= MAX_TEAMS_PER_USER) throw new DomainError('team_limit', `هر نفر حداکثر عضو ${MAX_TEAMS_PER_USER} تیم می‌تواند باشد.`);
      const [sp] = await tx.select({ id: schema.sports.id }).from(schema.sports).where(eq(schema.sports.id, i.sportId));
      const [ct] = await tx.select({ id: schema.cities.id }).from(schema.cities).where(eq(schema.cities.id, i.cityId));
      if (!sp || !ct) throw E.invalid('ورزش یا شهر معتبر نیست.');
      const [t] = await tx.insert(schema.teams).values({ ...i, inviteToken: token() }).returning();
      await tx.insert(schema.teamMembers).values({ teamId: t.id, userId, role: 'captain' });
      return t;
    });
  } catch (e) {
    const pg = ((e as { cause?: { code?: string; constraint_name?: string } }).cause ?? e) as { code?: string; constraint_name?: string };
    if (pg.code === '23505' && pg.constraint_name === 'teams_name_city_active') throw E.invalid('در این شهر تیمی با همین نام وجود دارد.');
    throw e;
  }
}

export async function updateTeam(captainId: string, teamId: string, raw: { description?: string; joinMode?: string; maxMembers?: number }) {
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, teamId);
    await assertCaptain(tx, teamId, captainId);
    const p = parse({ name: t.name, sportId: t.sportId, cityId: t.cityId, description: raw.description ?? t.description, joinMode: raw.joinMode ?? t.joinMode, maxMembers: raw.maxMembers ?? t.maxMembers });
    const count = (await members(tx, teamId)).length;
    if (p.maxMembers < count) throw E.invalid(`ظرفیت نمی‌تواند از تعداد اعضای فعلی (${count}) کمتر باشد.`);
    await tx.update(schema.teams).set({ description: p.description, joinMode: p.joinMode, maxMembers: p.maxMembers }).where(eq(schema.teams.id, teamId));
  });
}
async function assertCaptain(tx: Tx, teamId: string, userId: string) {
  const [m] = await tx.select().from(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.role, 'captain')));
  if (!m) throw E.notFound(); // never reveal captain-only data/actions to others
}

/** Join instantly: allowed for public teams, or for anyone holding the team's invite link. */
export async function joinTeam(userId: string, teamId: string, inviteToken?: string) {
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, teamId);
    const viaLink = !!inviteToken && inviteToken === t.inviteToken;
    if (t.joinMode !== 'public' && !viaLink) throw new DomainError('needs_request', t.joinMode === 'request' ? 'برای پیوستن به این تیم باید درخواست بدهید.' : 'این تیم فقط با لینک دعوت عضو می‌پذیرد.');
    await addMember(tx, t, userId);
    await tx.update(schema.teamRequests).set({ status: 'approved', decidedAt: new Date() }).where(and(eq(schema.teamRequests.teamId, teamId), eq(schema.teamRequests.userId, userId), eq(schema.teamRequests.status, 'pending')));
    const cap = (await members(tx, teamId)).find((m) => m.role === 'captain');
    if (cap) await notify(tx, cap.userId, 'team_member', `یک عضو جدید به «${t.name}» پیوست`, '', `/teams/${t.id}`);
  });
}

export async function requestToJoin(userId: string, teamId: string, message = '') {
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, teamId);
    if (t.joinMode !== 'request') throw E.invalid(t.joinMode === 'public' ? 'این تیم عمومی است؛ مستقیم بپیوندید.' : 'این تیم فقط با لینک دعوت عضو می‌پذیرد.');
    const ms = await members(tx, teamId);
    if (ms.some((m) => m.userId === userId)) throw new DomainError('already_member', 'شما قبلاً عضو این تیم هستید.');
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.teamRequests).where(and(eq(schema.teamRequests.userId, userId), eq(schema.teamRequests.status, 'pending')));
    if (n >= MAX_PENDING_REQUESTS) throw E.invalid('درخواست‌های در انتظار شما زیاد است؛ ابتدا چند مورد را لغو کنید.');
    const dup = await tx.select({ id: schema.teamRequests.id }).from(schema.teamRequests).where(and(eq(schema.teamRequests.teamId, teamId), eq(schema.teamRequests.userId, userId), eq(schema.teamRequests.status, 'pending')));
    if (dup.length) throw new DomainError('duplicate', 'درخواست شما قبلاً ثبت شده و در انتظار بررسی است.');
    await tx.insert(schema.teamRequests).values({ teamId, userId, message: message.trim().slice(0, 300) });
    const cap = ms.find((m) => m.role === 'captain');
    if (cap) await notify(tx, cap.userId, 'team_request', `درخواست عضویت در «${t.name}»`, '', `/teams/${t.id}`);
  });
}
export async function cancelRequest(userId: string, requestId: string) {
  const r = await db().update(schema.teamRequests).set({ status: 'cancelled', decidedAt: new Date() })
    .where(and(eq(schema.teamRequests.id, requestId), eq(schema.teamRequests.userId, userId), eq(schema.teamRequests.status, 'pending'))).returning({ id: schema.teamRequests.id });
  if (!r.length) throw E.notFound();
}

export async function decideRequest(captainId: string, requestId: string, approve: boolean) {
  await db().transaction(async (tx) => {
    const [r] = await tx.select().from(schema.teamRequests).where(eq(schema.teamRequests.id, requestId));
    if (!r) throw E.notFound();
    const t = await lockTeam(tx, r.teamId);
    await assertCaptain(tx, t.id, captainId);
    const [cur] = await tx.select().from(schema.teamRequests).where(eq(schema.teamRequests.id, requestId)).for('update');
    if (cur.status !== 'pending') throw E.badState();
    if (approve) await addMember(tx, t, r.userId);
    await tx.update(schema.teamRequests).set({ status: approve ? 'approved' : 'rejected', decidedAt: new Date() }).where(eq(schema.teamRequests.id, requestId));
    await notify(tx, r.userId, 'team_request_result', approve ? `به تیم «${t.name}» پیوستید` : `درخواست شما برای «${t.name}» پذیرفته نشد`, '', approve ? `/teams/${t.id}` : '/teams');
  });
}

export async function leaveTeam(userId: string, teamId: string) {
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, teamId);
    const [m] = await tx.select().from(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)));
    if (!m) throw E.notFound();
    if (m.role === 'captain') throw new DomainError('captain_cannot_leave', 'کاپیتان نمی‌تواند خارج شود؛ ابتدا کاپیتانی را به عضو دیگری بدهید یا تیم را منحل کنید.');
    await tx.delete(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)));
    const cap = (await members(tx, teamId)).find((x) => x.role === 'captain');
    if (cap) await notify(tx, cap.userId, 'team_member', `یک عضو «${t.name}» را ترک کرد`, '', `/teams/${t.id}`);
  });
}
export async function removeMember(captainId: string, teamId: string, userId: string) {
  if (captainId === userId) throw E.invalid('کاپیتان را نمی‌توان حذف کرد.');
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, teamId);
    await assertCaptain(tx, teamId, captainId);
    const r = await tx.delete(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId))).returning();
    if (!r.length) throw E.notFound();
    await notify(tx, userId, 'team_member', `از تیم «${t.name}» حذف شدید`, '', '/teams');
  });
}
export async function transferCaptain(captainId: string, teamId: string, toUserId: string) {
  if (captainId === toUserId) throw E.invalid('شما همین حالا کاپیتان هستید.');
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, teamId);
    await assertCaptain(tx, teamId, captainId);
    const [to] = await tx.select().from(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, toUserId)));
    if (!to) throw E.invalid('این بازیکن عضو تیم نیست.');
    await tx.update(schema.teamMembers).set({ role: 'member' }).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, captainId)));
    await tx.update(schema.teamMembers).set({ role: 'captain' }).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, toUserId)));
    await notify(tx, toUserId, 'team_member', `شما کاپیتان «${t.name}» شدید`, '', `/teams/${t.id}`);
    await tx.insert(schema.auditLogs).values({ actorId: captainId, action: 'team.transfer_captain', entity: 'team', entityId: teamId, diff: { to: toUserId } });
  });
}
export async function regenerateInvite(captainId: string, teamId: string) {
  await db().transaction(async (tx) => { await lockTeam(tx, teamId); await assertCaptain(tx, teamId, captainId); await tx.update(schema.teams).set({ inviteToken: token() }).where(eq(schema.teams.id, teamId)); });
}
export async function disbandTeam(captainId: string, teamId: string) {
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, teamId);
    await assertCaptain(tx, teamId, captainId);
    const ms = await members(tx, teamId);
    await tx.update(schema.teams).set({ status: 'disbanded' }).where(eq(schema.teams.id, teamId));
    await tx.update(schema.teamRequests).set({ status: 'cancelled', decidedAt: new Date() }).where(and(eq(schema.teamRequests.teamId, teamId), eq(schema.teamRequests.status, 'pending')));
    for (const m of ms.filter((x) => x.userId !== captainId)) await notify(tx, m.userId, 'team_member', `تیم «${t.name}» منحل شد`, '', '/teams');
    await tx.insert(schema.auditLogs).values({ actorId: captainId, action: 'team.disband', entity: 'team', entityId: teamId, diff: { members: ms.length } });
  });
}

/* ---------------- sessions & matching ---------------- */
/** A team member who is the HOST of a session invites the rest of the team. Once per team+session. */
export async function inviteTeamToSession(userId: string, sessionId: string, teamId: string) {
  await db().transaction(async (tx) => {
    const [s] = await tx.select().from(schema.openSessions).where(and(eq(schema.openSessions.id, sessionId), eq(schema.openSessions.hostUserId, userId), inArray(schema.openSessions.status, ['collecting', 'confirmed']))).for('share');
    if (!s) throw E.notFound();
    const t = await lockTeam(tx, teamId);
    const ms = await members(tx, teamId);
    if (!ms.some((m) => m.userId === userId)) throw E.notFound();
    if (t.sportId !== s.sportId) throw E.invalid('ورزش تیم با ورزش این سانس یکی نیست.');
    const ins = await tx.insert(schema.teamSessionInvites).values({ teamId, sessionId, invitedBy: userId }).onConflictDoNothing().returning({ id: schema.teamSessionInvites.id });
    if (!ins.length) throw new DomainError('duplicate', 'اعضای این تیم قبلاً برای این سانس دعوت شده‌اند.');
    const link = `/sessions/${sessionId}${s.visibility === 'invite_only' ? `?t=${s.inviteToken}` : ''}`;
    for (const m of ms.filter((x) => x.userId !== userId)) await notify(tx, m.userId, 'team_session', `دعوت تیم «${t.name}» به یک سانس`, 'یکی از هم‌تیمی‌ها یک سانس باز ساخته است.', link);
    return ins.length;
  });
}
export const teamsOfUser = (userId: string) => db().select({ id: schema.teams.id, name: schema.teams.name, sportId: schema.teams.sportId, role: schema.teamMembers.role })
  .from(schema.teamMembers).innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId)).where(and(eq(schema.teamMembers.userId, userId), eq(schema.teams.status, 'active'))).orderBy(asc(schema.teams.name));

/**
 * Matching: players in the team's city who play the team's sport, whose OVR is close to the team average,
 * who are not already members and whose profile is public. Closest OVR first; high reliability breaks ties.
 */
export async function suggestPlayers(captainId: string, teamId: string, limit = 8) {
  const [t] = await db().select().from(schema.teams).where(and(eq(schema.teams.id, teamId), eq(schema.teams.status, 'active')));
  if (!t) throw E.notFound();
  const [cap] = await db().select().from(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, captainId), eq(schema.teamMembers.role, 'captain')));
  if (!cap) throw E.notFound();
  const [{ avg }] = await db().select({ avg: sql<number>`coalesce(avg(${schema.playerSportProfiles.ovr}),50)::float` }).from(schema.teamMembers)
    .leftJoin(schema.playerSportProfiles, and(eq(schema.playerSportProfiles.userId, schema.teamMembers.userId), eq(schema.playerSportProfiles.sportId, t.sportId))).where(eq(schema.teamMembers.teamId, teamId));
  const rel = sql<number>`greatest(0, least(100, 100 + coalesce((select sum(delta) from reliability_events re where re.user_id = ${schema.users.id}), 0)))`;
  const rows = await db().select({ id: schema.users.id, name: schema.users.displayName, avatar: schema.users.avatarUrl, ovr: schema.playerSportProfiles.ovr, reliability: rel })
    .from(schema.playerSportProfiles).innerJoin(schema.users, eq(schema.users.id, schema.playerSportProfiles.userId)).innerJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
    .where(and(eq(schema.playerSportProfiles.sportId, t.sportId), eq(schema.userProfiles.cityId, t.cityId), eq(schema.users.status, 'active'),
      sql`coalesce((${schema.userProfiles.privacy}->>'showProfile')::boolean, true)`,
      sql`${schema.users.id} NOT IN (SELECT user_id FROM team_members WHERE team_id = ${teamId})`,
      sql`${schema.users.displayName} <> ''`))
    .orderBy(sql`abs(${schema.playerSportProfiles.ovr} - ${avg}::double precision)`, desc(rel)).limit(limit);
  return { avgOvr: Math.round(avg), players: rows };
}
/** Captain sends a join invitation (once per player per 7 days). The player decides; nothing happens automatically. */
export async function invitePlayer(captainId: string, teamId: string, userId: string) {
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, teamId);
    await assertCaptain(tx, teamId, captainId);
    const ms = await members(tx, teamId);
    if (ms.some((m) => m.userId === userId)) throw new DomainError('already_member', 'این بازیکن همین حالا عضو تیم است.');
    if (ms.length >= t.maxMembers) throw new DomainError('team_full', 'ظرفیت تیم تکمیل است.');
    const [u] = await tx.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.status, 'active')));
    if (!u) throw E.notFound();
    const link = `/teams/join/${t.inviteToken}`;
    const recent = await tx.select({ id: schema.notifications.id }).from(schema.notifications).where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.type, 'team_invite'), eq(schema.notifications.link, link), gt(schema.notifications.createdAt, new Date(Date.now() - 7 * 86400_000))));
    if (recent.length) throw new DomainError('duplicate', 'به این بازیکن به‌تازگی دعوت فرستاده‌اید.');
    await notify(tx, userId, 'team_invite', `دعوت به تیم «${t.name}»`, 'کاپیتان تیم شما را برای پیوستن دعوت کرده است.', link);
  });
}

/* ---------------- queries ---------------- */
export interface TeamFilters { sportId?: string; cityId?: string; q?: string; page?: number }
const PAGE = 12;
export async function listTeams(f: TeamFilters = {}) {
  const conds = [eq(schema.teams.status, 'active')];
  if (f.sportId) conds.push(eq(schema.teams.sportId, f.sportId));
  if (f.cityId) conds.push(eq(schema.teams.cityId, f.cityId));
  if (f.q) conds.push(ilike(schema.teams.name, `%${f.q.replace(/[%_]/g, '').slice(0, 40)}%`));
  const page = Math.max(1, f.page ?? 1);
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.teams).where(and(...conds));
  const count = sql<number>`(SELECT count(*)::int FROM team_members m WHERE m.team_id = ${schema.teams.id})`;
  const avgOvr = sql<number>`coalesce((SELECT round(avg(p.ovr))::int FROM team_members m JOIN player_sport_profiles p ON p.user_id = m.user_id AND p.sport_id = ${schema.teams.sportId} WHERE m.team_id = ${schema.teams.id}), 0)`;
  const rows = await db().select({ t: schema.teams, sportName: schema.sports.nameFa, cityName: schema.cities.nameFa, count, avgOvr })
    .from(schema.teams).innerJoin(schema.sports, eq(schema.sports.id, schema.teams.sportId)).innerJoin(schema.cities, eq(schema.cities.id, schema.teams.cityId))
    .where(and(...conds)).orderBy(desc(count), asc(schema.teams.name)).limit(PAGE).offset((page - 1) * PAGE);
  return { rows: rows.map((r) => ({ ...r, t: { ...r.t, inviteToken: '' } })), total: n, page, pages: Math.max(1, Math.ceil(n / PAGE)) };
}

export async function getTeam(viewerId: string | null, teamId: string) {
  const [row] = await db().select({ t: schema.teams, sportName: schema.sports.nameFa, cityName: schema.cities.nameFa }).from(schema.teams)
    .innerJoin(schema.sports, eq(schema.sports.id, schema.teams.sportId)).innerJoin(schema.cities, eq(schema.cities.id, schema.teams.cityId)).where(and(eq(schema.teams.id, teamId), eq(schema.teams.status, 'active')));
  if (!row) return null;
  const ms = await db().select({ userId: schema.users.id, name: schema.users.displayName, avatar: schema.users.avatarUrl, role: schema.teamMembers.role, joinedAt: schema.teamMembers.joinedAt, ovr: schema.playerSportProfiles.ovr })
    .from(schema.teamMembers).innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
    .leftJoin(schema.playerSportProfiles, and(eq(schema.playerSportProfiles.userId, schema.users.id), eq(schema.playerSportProfiles.sportId, row.t.sportId)))
    .where(and(eq(schema.teamMembers.teamId, teamId), ne(schema.users.status, 'deleted'))).orderBy(asc(schema.teamMembers.role), asc(schema.teamMembers.joinedAt));
  const mine = viewerId ? ms.find((m) => m.userId === viewerId) : undefined;
  const isCaptain = mine?.role === 'captain';
  const requests = isCaptain ? await db().select({ r: schema.teamRequests, name: schema.users.displayName }).from(schema.teamRequests).innerJoin(schema.users, eq(schema.users.id, schema.teamRequests.userId))
    .where(and(eq(schema.teamRequests.teamId, teamId), eq(schema.teamRequests.status, 'pending'))).orderBy(asc(schema.teamRequests.createdAt)) : [];
  const myRequest = viewerId && !mine ? (await db().select().from(schema.teamRequests).where(and(eq(schema.teamRequests.teamId, teamId), eq(schema.teamRequests.userId, viewerId), eq(schema.teamRequests.status, 'pending'))))[0] : undefined;
  const ovrs = ms.map((m) => m.ovr).filter((x): x is number => x != null);
  return {
    team: { ...row.t, inviteToken: isCaptain ? row.t.inviteToken : '' }, sportName: row.sportName, cityName: row.cityName,
    members: ms, avgOvr: ovrs.length ? Math.round(ovrs.reduce((a, b) => a + b, 0) / ovrs.length) : 0,
    isMember: !!mine, isCaptain, requests, myRequestId: myRequest?.id ?? null, full: ms.length >= row.t.maxMembers,
  };
}
export async function getTeamByInviteToken(tok: string) {
  const [t] = await db().select({ id: schema.teams.id }).from(schema.teams).where(and(eq(schema.teams.inviteToken, tok), eq(schema.teams.status, 'active')));
  return t ?? null;
}
