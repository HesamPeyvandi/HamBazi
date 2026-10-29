'use server';
import { redirect } from 'next/navigation';
import { requireRole, requireUser } from '@/server/auth/rbac';
import { DomainError } from '@/server/booking/errors';
import { closeSupport, createSupportMessage } from './index';

export async function sendSupportAction(fd: FormData) {
  const u = await requireUser('/help');
  try { await createSupportMessage(u.id, { topic: String(fd.get('topic') ?? ''), body: String(fd.get('body') ?? '') }); }
  catch (e) { if (e instanceof DomainError) redirect(`/help?err=${encodeURIComponent(e.message)}#contact`); throw e; }
  redirect('/help?ok=sent#contact');
}
export async function closeSupportAction(id: string) {
  const u = await requireRole(['admin']);
  try { await closeSupport(u, id); } catch (e) { if (e instanceof DomainError) redirect(`/admin/support?err=${encodeURIComponent(e.message)}`); throw e; }
  redirect('/admin/support?ok=1');
}
