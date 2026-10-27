import { notFound, redirect } from 'next/navigation';
import { getSessionByToken } from '@/server/booking/sessions';

export default async function JoinByToken({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{8,40}$/.test(token)) notFound();
  const id = await getSessionByToken(token);
  if (!id) notFound();
  redirect(`/sessions/${id}?t=${encodeURIComponent(token)}`);
}
