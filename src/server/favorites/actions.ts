'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser, safeRedirectPath } from '@/server/auth/rbac';
import { DomainError } from '@/server/booking/errors';
import { setFavorite } from './index';

const UUID = /^[0-9a-f-]{36}$/i;
export async function toggleFavoriteAction(venueId: string, on: boolean) {
  const u = await requireUser('/favorites');
  let back = '/favorites';
  try { const r = (await headers()).get('referer'); if (r) { const x = new URL(r); back = safeRedirectPath(x.pathname + x.search, '/favorites'); } } catch { /* keep default */ }
  if (UUID.test(venueId)) { try { await setFavorite(u.id, venueId, on); } catch (e) { if (!(e instanceof DomainError)) throw e; } }
  redirect(back);
}
