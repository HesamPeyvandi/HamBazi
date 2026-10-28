'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/rbac';
import { DomainError } from '@/server/booking/errors';
import { normalizeDigits } from '@/lib/i18n/digits';
import {
  cancelRequest, createTeam, decideRequest, disbandTeam, inviteTeamToSession, invitePlayer, joinTeam, leaveTeam,
  regenerateInvite, removeMember, requestToJoin, transferCaptain, updateTeam,
} from './index';

const UUID = /^[0-9a-f-]{36}$/i;
const int = (v: FormDataEntryValue | null, d = NaN) => { const n = parseInt(normalizeDigits(String(v ?? '')).replace(/[^\d]/g, ''), 10); return Number.isNaN(n) ? d : n; };
async function run<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { if (e instanceof DomainError) redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(e.message)}`); throw e; }
}
const guard = (id: string) => { if (!UUID.test(id)) redirect('/teams'); };

export async function createTeamAction(fd: FormData) {
  const u = await requireUser('/teams/new');
  const t = await run('/teams/new', () => createTeam(u.id, {
    name: String(fd.get('name') ?? ''), sportId: String(fd.get('sportId') ?? ''), cityId: String(fd.get('cityId') ?? ''), description: String(fd.get('description') ?? ''),
    joinMode: String(fd.get('joinMode') ?? 'request'), maxMembers: int(fd.get('maxMembers'), 20),
  }));
  redirect(`/teams/${t.id}?ok=created`);
}
export async function joinTeamAction(teamId: string, token: string | undefined) {
  guard(teamId); const path = `/teams/${teamId}${token ? `?t=${token}` : ''}`;
  const u = await requireUser(path);
  await run(path, () => joinTeam(u.id, teamId, token));
  redirect(`/teams/${teamId}?ok=joined`);
}
export async function requestJoinAction(teamId: string, fd: FormData) {
  guard(teamId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => requestToJoin(u.id, teamId, String(fd.get('message') ?? '')));
  redirect(`/teams/${teamId}?ok=requested`);
}
export async function cancelRequestAction(teamId: string, requestId: string) {
  guard(teamId); guard(requestId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => cancelRequest(u.id, requestId));
  redirect(`/teams/${teamId}?ok=cancelled`);
}
export async function decideRequestAction(teamId: string, requestId: string, approve: boolean) {
  guard(teamId); guard(requestId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => decideRequest(u.id, requestId, approve));
  redirect(`/teams/${teamId}?ok=${approve ? 'approved' : 'rejected'}`);
}
export async function leaveTeamAction(teamId: string) {
  guard(teamId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => leaveTeam(u.id, teamId));
  redirect('/teams?ok=left');
}
export async function removeMemberAction(teamId: string, userId: string) {
  guard(teamId); guard(userId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => removeMember(u.id, teamId, userId));
  redirect(`/teams/${teamId}?ok=removed`);
}
export async function transferCaptainAction(teamId: string, userId: string) {
  guard(teamId); guard(userId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => transferCaptain(u.id, teamId, userId));
  redirect(`/teams/${teamId}?ok=transferred`);
}
export async function regenerateInviteAction(teamId: string) {
  guard(teamId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => regenerateInvite(u.id, teamId));
  redirect(`/teams/${teamId}?ok=regenerated`);
}
export async function disbandTeamAction(teamId: string) {
  guard(teamId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => disbandTeam(u.id, teamId));
  redirect('/teams?ok=disbanded');
}
export async function updateTeamAction(teamId: string, fd: FormData) {
  guard(teamId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => updateTeam(u.id, teamId, { description: String(fd.get('description') ?? ''), joinMode: String(fd.get('joinMode') ?? ''), maxMembers: int(fd.get('maxMembers'), 20) }));
  redirect(`/teams/${teamId}?ok=saved`);
}
export async function invitePlayerAction(teamId: string, userId: string) {
  guard(teamId); guard(userId); const u = await requireUser(`/teams/${teamId}`);
  await run(`/teams/${teamId}`, () => invitePlayer(u.id, teamId, userId));
  redirect(`/teams/${teamId}?ok=invited`);
}
export async function inviteTeamToSessionAction(sessionId: string, fd: FormData) {
  guard(sessionId); const u = await requireUser(`/sessions/${sessionId}`);
  const teamId = String(fd.get('teamId') ?? ''); guard(teamId);
  await run(`/sessions/${sessionId}`, () => inviteTeamToSession(u.id, sessionId, teamId));
  redirect(`/sessions/${sessionId}?ok=team_invited`);
}
