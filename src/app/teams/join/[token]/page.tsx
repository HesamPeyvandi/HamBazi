import { notFound, redirect } from 'next/navigation';
import { getTeamByInviteToken } from '@/server/teams';
export const metadata = { title: 'دعوت به تیم' };
/** Invite links land here and forward to the team page carrying the token (used only for the join action). */
export default async function JoinByToken({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTeamByInviteToken(token.slice(0, 64));
  if (!t) notFound();
  redirect(`/teams/${t.id}?t=${encodeURIComponent(token)}`);
}
