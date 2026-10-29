import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/rbac';
import { DomainError } from '@/server/booking/errors';
import { ensureRoom } from '@/server/messaging';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

/** Entry point from a team page: creates the room on first use (members only), then redirects. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/chat/team/${id}`);
  if (!UUID.test(id)) notFound();
  let roomId: string;
  try { roomId = await ensureRoom(user.id, 'team', id); } catch (e) { if (e instanceof DomainError) notFound(); throw e; }
  redirect(`/chat/${roomId}`);
}
