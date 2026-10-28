import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db/client';
import { resetDb } from './helpers';
import { DomainError } from '@/server/booking/errors';
import { createOpenSession } from '@/server/booking/sessions';
import { simulatePay } from '@/server/booking/settle';
import { saveNotifPrefs } from '@/server/account';
import {
  cancelRequest, createTeam, decideRequest, disbandTeam, getTeam, getTeamByInviteToken, inviteTeamToSession, invitePlayer, joinTeam, leaveTeam,
  listTeams, regenerateInvite, removeMember, requestToJoin, suggestPlayers, transferCaptain, updateTeam, teamsOfUser, MAX_TEAMS_PER_USER,
} from '@/server/teams';

let sportId: string, volleyId: string, cityId: string, venueId: string, n = 0;
const H = 3_600_000;
async function mkUser(ovr = 50, opts: { city?: boolean; privacy?: boolean; name?: string } = {}) {
  const [u] = await db().insert(schema.users).values({ phoneE164: `+98912${String(3000000 + ++n)}`, displayName: opts.name ?? `بازیکن ${n} نمونه` }).returning();
  await db().insert(schema.userProfiles).values({ userId: u.id, cityId: opts.city === false ? null : cityId, privacy: { showProfile: opts.privacy !== false, showHistory: true } });
  await db().insert(schema.playerSportProfiles).values({ userId: u.id, sportId, selfScores: { shooting: ovr }, ovr });
  return u.id;
}
async function code(p: Promise<unknown>) { const e = await p.then(() => null, (x) => x); return e instanceof DomainError ? e.code : e ? 'other:' + (e as Error).message : 'ok'; }
const team = (cap: string, over: Record<string, unknown> = {}) => createTeam(cap, { name: `تیم ${++n}`, sportId, cityId, joinMode: 'request', maxMembers: 5, ...over });
const notes = (uid: string, type?: string) => db().select().from(schema.notifications).where(eq(schema.notifications.userId, uid)).then((r) => (type ? r.filter((x) => x.type === type) : r));

beforeAll(async () => {
  await resetDb();
  const [c] = await db().insert(schema.cities).values({ nameFa: 'سمنان', slug: 'semnan', isDefault: true }).returning(); cityId = c.id;
  const [sp] = await db().insert(schema.sports).values({ key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: [{ key: 'shooting', nameFa: 's' }] }).returning(); sportId = sp.id;
  const [vb] = await db().insert(schema.sports).values({ key: 'volleyball', nameFa: 'والیبال', defaultCapacity: 12, skillCategories: [{ key: 'serve', nameFa: 's' }] }).returning(); volleyId = vb.id;
  const owner = await mkUser();
  await db().update(schema.users).set({ displayName: '' }).where(eq(schema.users.id, owner)); // the venue owner must not appear in matching
  const [v] = await db().insert(schema.venues).values({ ownerUserId: owner, cityId, slug: 'v', name: 'سالن', address: 'x', status: 'published' }).returning(); venueId = v.id;
  await db().insert(schema.venueSports).values({ venueId, sportId, pricePerSlot: 200000, maxCapacity: 12 });
});
beforeEach(async () => {
  await sqlClient()`TRUNCATE team_session_invites, team_requests, team_members, teams, notifications, reservations, slot_claims, open_sessions, session_participants, payment_intents, payment_events, refunds RESTART IDENTITY CASCADE`;
  await sqlClient()`DELETE FROM time_slots`;
});
afterAll(async () => { await sqlClient().end(); });

describe('creating teams', () => {
  it('creator becomes the single captain; unique name per city (case-insensitive); validation', async () => {
    const a = await mkUser();
    const t = await createTeam(a, { name: 'ستارگان', sportId, cityId, maxMembers: 8 });
    const d = await getTeam(a, t.id);
    expect(d?.isCaptain).toBe(true); expect(d?.members).toHaveLength(1);
    expect(await code(createTeam(await mkUser(), { name: 'ستارگان', sportId, cityId }))).toBe('invalid');
    expect(await code(createTeam(a, { name: 'ab', sportId, cityId }))).toBe('invalid');
    expect(await code(createTeam(a, { name: 'خوب', sportId, cityId, maxMembers: 1 }))).toBe('invalid');
    expect(await code(createTeam(a, { name: 'تیم بد', sportId: '00000000-0000-0000-0000-000000000000', cityId }))).toBe('invalid');
  });
  it('a user can be in at most 5 teams', async () => {
    const a = await mkUser();
    for (let i = 0; i < MAX_TEAMS_PER_USER; i++) await team(a);
    expect(await code(team(a))).toBe('team_limit');
  });
  it('database guarantees exactly one captain per team', async () => {
    const a = await mkUser(); const b = await mkUser(); const t = await team(a);
    await expect(db().insert(schema.teamMembers).values({ teamId: t.id, userId: b, role: 'captain' })).rejects.toThrow();
  });
});

describe('joining', () => {
  it('public team: instant join; captain notified; duplicate and capacity enforced', async () => {
    const cap = await mkUser(); const t = await team(cap, { joinMode: 'public', maxMembers: 2 });
    const u = await mkUser(); await joinTeam(u, t.id);
    expect((await getTeam(u, t.id))?.isMember).toBe(true);
    expect((await notes(cap, 'team_member')).length).toBe(1);
    expect(await code(joinTeam(u, t.id))).toBe('already_member');
    expect(await code(joinTeam(await mkUser(), t.id))).toBe('team_full');
  });
  it('request team: direct join refused; request → approve adds member and notifies', async () => {
    const cap = await mkUser(); const t = await team(cap); const u = await mkUser();
    expect(await code(joinTeam(u, t.id))).toBe('needs_request');
    await requestToJoin(u, t.id, 'سلام، می‌خوام بیام');
    expect(await code(requestToJoin(u, t.id))).toBe('duplicate');
    const d = await getTeam(cap, t.id);
    expect(d?.requests).toHaveLength(1);
    expect((await getTeam(u, t.id))?.requests).toHaveLength(0); // only the captain sees requests
    await decideRequest(cap, d!.requests[0].r.id, true);
    expect((await getTeam(u, t.id))?.isMember).toBe(true);
    expect((await notes(u, 'team_request_result'))[0].title).toContain('پیوستید');
    expect(await code(decideRequest(cap, d!.requests[0].r.id, true))).toBe('bad_state');
  });
  it('reject, cancel; only the captain can decide; request on public/invite-only team refused', async () => {
    const cap = await mkUser(); const t = await team(cap); const u = await mkUser(); const v = await mkUser();
    await requestToJoin(u, t.id); await requestToJoin(v, t.id);
    const reqs = (await getTeam(cap, t.id))!.requests;
    expect(await code(decideRequest(v, reqs[0].r.id, true))).toBe('not_found');
    await decideRequest(cap, reqs[0].r.id, false);
    expect((await getTeam(reqs[0].r.userId, t.id))?.isMember).toBe(false);
    await cancelRequest(reqs[1].r.userId, reqs[1].r.id);
    expect(await code(cancelRequest(reqs[1].r.userId, reqs[1].r.id))).toBe('not_found');
    const pub = await team(cap, { joinMode: 'public' }); const inv = await team(cap, { joinMode: 'invite_only' });
    expect(await code(requestToJoin(u, pub.id))).toBe('invalid'); expect(await code(requestToJoin(u, inv.id))).toBe('invalid');
  });
  it('invite-only: needs the right link token; regenerating revokes the old link', async () => {
    const cap = await mkUser(); const t = await team(cap, { joinMode: 'invite_only' }); const u = await mkUser();
    expect(await code(joinTeam(u, t.id))).toBe('needs_request');
    expect(await code(joinTeam(u, t.id, 'wrong'))).toBe('needs_request');
    const tok = (await getTeam(cap, t.id))!.team.inviteToken;
    expect((await getTeam(u, t.id))!.team.inviteToken).toBe('');   // non-captains never see the token
    expect((await getTeamByInviteToken(tok))?.id).toBe(t.id);
    await regenerateInvite(cap, t.id);
    expect(await getTeamByInviteToken(tok)).toBeNull();
    expect(await code(joinTeam(u, t.id, tok))).toBe('needs_request');
    await joinTeam(u, t.id, (await getTeam(cap, t.id))!.team.inviteToken);
    expect((await getTeam(u, t.id))?.isMember).toBe(true);
  });
  it('concurrent joins never exceed capacity', async () => {
    const cap = await mkUser(); const t = await team(cap, { joinMode: 'public', maxMembers: 4 });
    const us = await Promise.all(Array.from({ length: 8 }, () => mkUser()));
    const res = await Promise.allSettled(us.map((u) => joinTeam(u, t.id)));
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect((await getTeam(cap, t.id))?.members).toHaveLength(4);
  });
});

describe('membership management', () => {
  it('leave: members may, captain may not; remove, transfer and disband are captain-only', async () => {
    const cap = await mkUser(); const t = await team(cap, { joinMode: 'public' }); const a = await mkUser(); const b = await mkUser();
    await joinTeam(a, t.id); await joinTeam(b, t.id);
    expect(await code(leaveTeam(cap, t.id))).toBe('captain_cannot_leave');
    await leaveTeam(a, t.id);
    expect(await code(removeMember(b, t.id, cap))).toBe('not_found');
    expect(await code(removeMember(cap, t.id, cap))).toBe('invalid');
    await removeMember(cap, t.id, b);
    expect((await notes(b, 'team_member')).some((x) => x.title.includes('حذف'))).toBe(true);
    await joinTeam(a, t.id);
    expect(await code(transferCaptain(a, t.id, cap))).toBe('not_found');
    expect(await code(transferCaptain(cap, t.id, b))).toBe('invalid');         // b was removed
    await transferCaptain(cap, t.id, a);
    const d = await getTeam(a, t.id);
    expect(d?.isCaptain).toBe(true); expect(d?.members.filter((m) => m.role === 'captain')).toHaveLength(1);
    await leaveTeam(cap, t.id);                                                // old captain can now leave
    expect(await code(disbandTeam(cap, t.id))).toBe('not_found');
    await disbandTeam(a, t.id);
    expect(await getTeam(a, t.id)).toBeNull();
    expect(await code(joinTeam(await mkUser(), t.id))).toBe('not_found');
    expect((await listTeams()).rows).toHaveLength(0);
  });
  it('updateTeam cannot shrink below the member count; only captain', async () => {
    const cap = await mkUser(); const t = await team(cap, { joinMode: 'public', maxMembers: 5 });
    for (let i = 0; i < 3; i++) await joinTeam(await mkUser(), t.id);
    expect(await code(updateTeam(cap, t.id, { maxMembers: 3 }))).toBe('invalid');
    await updateTeam(cap, t.id, { maxMembers: 4, description: 'جدید', joinMode: 'invite_only' });
    const d = await getTeam(cap, t.id);
    expect(d?.team).toMatchObject({ maxMembers: 4, description: 'جدید', joinMode: 'invite_only' });
    expect(await code(updateTeam(await mkUser(), t.id, { maxMembers: 10 }))).toBe('not_found');
  });
});

describe('browse & matching', () => {
  it('listTeams filters by sport/city/name and paginates; never leaks invite tokens', async () => {
    const a = await mkUser();
    await createTeam(a, { name: 'عقاب‌ها', sportId, cityId }); await createTeam(a, { name: 'شاهین‌ها', sportId: volleyId, cityId });
    expect((await listTeams()).total).toBe(2);
    expect((await listTeams({ sportId: volleyId })).rows[0].t.name).toBe('شاهین‌ها');
    expect((await listTeams({ q: 'عقاب' })).total).toBe(1);
    expect((await listTeams({ q: '%' })).total).toBe(2);   // wildcard is stripped, not interpreted
    expect((await listTeams()).rows.every((r) => r.t.inviteToken === '')).toBe(true);
  });
  it('suggestPlayers: same sport+city, public profile, not members, closest OVR first', async () => {
    const cap = await mkUser(60); const t = await team(cap);
    const near = await mkUser(62, { name: 'نزدیک مهارت' }), far = await mkUser(95, { name: 'دور مهارت' }), mid = await mkUser(70, { name: 'میانه مهارت' });
    await mkUser(60, { city: false, name: 'شهر دیگر' }); await mkUser(61, { privacy: false, name: 'پروفایل خصوصی' });
    const member = await mkUser(60, { name: 'عضو تیم' }); await db().insert(schema.teamMembers).values({ teamId: t.id, userId: member });
    const r = await suggestPlayers(cap, t.id, 100);
    const ids = r.players.map((p) => p.id);
    expect(ids.filter((x) => [near, mid, far].includes(x))).toEqual([near, mid, far]);   // closest OVR first
    const names = r.players.map((p) => p.name);
    expect(names).not.toContain('شهر دیگر'); expect(names).not.toContain('پروفایل خصوصی'); expect(names).not.toContain('عضو تیم');
    expect(ids).not.toContain(cap);
    expect(await code(suggestPlayers(await mkUser(), t.id))).toBe('not_found');
  });
  it('suggestPlayers works when the team average OVR is fractional', async () => {
    const cap = await mkUser(60); const t = await team(cap, { joinMode: 'public' }); await joinTeam(await mkUser(61), t.id);   // avg 60.5
    await mkUser(63);
    expect((await suggestPlayers(cap, t.id, 100)).players.length).toBeGreaterThan(0);
  });
  it('invitePlayer: captain only, notifies once per 7 days, link works', async () => {
    const cap = await mkUser(); const t = await team(cap); const u = await mkUser();
    await invitePlayer(cap, t.id, u);
    expect((await notes(u, 'team_invite'))[0].link).toMatch(/^\/teams\/join\//);
    expect(await code(invitePlayer(cap, t.id, u))).toBe('duplicate');
    expect(await code(invitePlayer(u, t.id, cap))).toBe('not_found');
    expect(await code(invitePlayer(cap, t.id, cap))).toBe('already_member');
    const link = (await notes(u, 'team_invite'))[0].link!;
    expect((await getTeamByInviteToken(link.split('/').pop()!))?.id).toBe(t.id);
  });
  it('a user who turned off team notifications is not notified (but joining still works)', async () => {
    const cap = await mkUser(); await saveNotifPrefs(cap, { sessions: true, rating: true, owner: true, teams: false });
    const t = await team(cap, { joinMode: 'public' }); await joinTeam(await mkUser(), t.id);
    expect(await notes(cap, 'team_member')).toHaveLength(0);
  });
});

describe('inviting a team to a session', () => {
  async function hostedSession(host: string, sport = sportId) {
    const s = new Date(Date.now() + (72 + ++n) * H);
    const [slot] = await db().insert(schema.timeSlots).values({ venueId, sportId: sport, startsAt: s, endsAt: new Date(s.getTime() + 1.5 * H), price: 200000 }).returning();
    const r = await createOpenSession(host, { slotId: slot.id, targetCount: 4, joinDeadline: new Date(Date.now() + 24 * H) });
    await simulatePay(host, r.intentId);
    return r;
  }
  it('host who is a team member notifies the others once; non-hosts and non-members are refused', async () => {
    const host = await mkUser(); const t = await team(host, { joinMode: 'public' }); const a = await mkUser(); const b = await mkUser();
    await joinTeam(a, t.id); await joinTeam(b, t.id);
    const s = await hostedSession(host);
    await inviteTeamToSession(host, s.sessionId, t.id);
    expect((await notes(a, 'team_session'))[0].link).toBe(`/sessions/${s.sessionId}`);
    expect(await notes(host, 'team_session')).toHaveLength(0);
    expect(await code(inviteTeamToSession(host, s.sessionId, t.id))).toBe('duplicate');
    expect(await code(inviteTeamToSession(a, s.sessionId, t.id))).toBe('not_found');       // not the host
    const stranger = await mkUser(); const s2 = await hostedSession(stranger);
    expect(await code(inviteTeamToSession(stranger, s2.sessionId, t.id))).toBe('not_found'); // host but not in the team
    expect((await teamsOfUser(a)).map((x) => x.id)).toEqual([t.id]);
  });
  it('team sport must match the session sport', async () => {
    const host = await mkUser(); const vt = await createTeam(host, { name: 'والیبالی‌ها', sportId: volleyId, cityId });
    const s = await hostedSession(host);
    expect(await code(inviteTeamToSession(host, s.sessionId, vt.id))).toBe('invalid');
  });
});
