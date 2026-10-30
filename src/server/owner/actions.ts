'use server';
import { redirect } from 'next/navigation';
import { requireRole, requireUser } from '@/server/auth/rbac';
import { DomainError } from '@/server/booking/errors';
import { cancelReservationByVenue } from '@/server/booking/reservations';
import { normalizeDigits } from '@/lib/i18n/digits';
import { addStaff, removeStaff, addVenueImage, becomeVenueManager, createSlots, createVenue, deleteSlot, removeVenueImage, reviewVenue, setSlotOpen, submitForReview, updateVenue } from './venues';

const num = (v: FormDataEntryValue | null) => { const n = parseInt(normalizeDigits(String(v ?? '')).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const UUID = /^[0-9a-f-]{36}$/i;
const coord = (v: FormDataEntryValue | null) => { const t = normalizeDigits(String(v ?? '')).trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
async function run<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { if (e instanceof DomainError) redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(e.message)}`); throw e; }
}
const manager = () => requireRole(['venue_manager', 'admin']);

function venueFromForm(fd: FormData, sportIds: string[]) {
  return {
    name: String(fd.get('name') ?? ''), cityId: String(fd.get('cityId') ?? ''), address: String(fd.get('address') ?? ''), neighborhood: String(fd.get('neighborhood') ?? ''),
    description: String(fd.get('description') ?? ''), surface: String(fd.get('surface') ?? '') || undefined, openHours: String(fd.get('openHours') ?? '') || undefined,
    rules: String(fd.get('rules') ?? '').split('\n').map((x) => x.trim()).filter(Boolean),
    lat: coord(fd.get('lat')), lng: coord(fd.get('lng')),
    facilities: fd.getAll('facility').map(String),
    sports: sportIds.filter((id) => fd.get(`sport_${id}`) === 'on').map((id) => ({ sportId: id, price: num(fd.get(`price_${id}`)), minutes: num(fd.get(`minutes_${id}`)) || 90, maxCapacity: num(fd.get(`cap_${id}`)) || 10 })),
  };
}

export async function becomeManagerAction() { const u = await requireUser('/owner'); await becomeVenueManager(u.id); redirect('/owner'); }

export async function createVenueAction(sportIds: string[], fd: FormData) {
  const u = await manager();
  const v = await run('/owner/venues/new', () => createVenue(u, venueFromForm(fd, sportIds)));
  redirect(`/owner/venues/${v.id}?ok=created`);
}
export async function updateVenueAction(venueId: string, sportIds: string[], fd: FormData) {
  const u = await manager();
  await run(`/owner/venues/${venueId}`, () => updateVenue(u, venueId, venueFromForm(fd, sportIds)));
  redirect(`/owner/venues/${venueId}?ok=saved`);
}
export async function uploadImageAction(venueId: string, fd: FormData) {
  const u = await manager();
  const f = fd.get('image');
  const back = `/owner/venues/${venueId}`;
  if (!(f instanceof File) || f.size === 0) redirect(`${back}?err=${encodeURIComponent('فایلی انتخاب نشده است.')}`);
  await run(back, async () => addVenueImage(u, venueId, Buffer.from(await (f as File).arrayBuffer())));
  redirect(`${back}?ok=image`);
}
export async function removeImageAction(venueId: string, imageId: string) {
  const u = await manager();
  await run(`/owner/venues/${venueId}`, () => removeVenueImage(u, venueId, imageId));
  redirect(`/owner/venues/${venueId}?ok=image_removed`);
}
export async function submitReviewAction(venueId: string) {
  const u = await manager();
  await run(`/owner/venues/${venueId}`, () => submitForReview(u, venueId));
  redirect(`/owner/venues/${venueId}?ok=submitted`);
}

export async function createSlotsAction(venueId: string, fd: FormData) {
  const u = await manager();
  const back = `/owner/venues/${venueId}/slots`;
  const days = fd.getAll('day').map(String).map((s) => s.split('-').map(Number)).filter((a) => a.length === 3 && a.every(Number.isFinite)).map(([y, m, d]) => ({ y, m, d }));
  const [sh, sm] = String(fd.get('start') ?? '17:00').split(':').map(Number);
  const r = await run(back, () => createSlots(u, venueId, {
    sportId: String(fd.get('sportId') ?? ''), days, startHour: sh, startMin: sm || 0, endHour: num(fd.get('endHour')) || 23, price: num(fd.get('price')) || undefined,
  }));
  redirect(`${back}?ok=${r.created}&skipped=${r.skipped}`);
}
export async function toggleSlotAction(venueId: string, slotId: string, open: boolean) {
  const u = await manager();
  await run(`/owner/venues/${venueId}/slots`, () => setSlotOpen(u, slotId, open));
  redirect(`/owner/venues/${venueId}/slots`);
}
export async function deleteSlotAction(venueId: string, slotId: string) {
  const u = await manager();
  await run(`/owner/venues/${venueId}/slots`, () => deleteSlot(u, slotId));
  redirect(`/owner/venues/${venueId}/slots`);
}
export async function ownerCancelReservationAction(reservationId: string) {
  const u = await manager();
  if (!UUID.test(reservationId)) redirect('/owner/reservations');
  await run('/owner/reservations', () => cancelReservationByVenue(u, reservationId));
  redirect('/owner/reservations?ok=cancelled');
}
export async function reviewVenueAction(venueId: string, decision: 'approve' | 'reject', fd: FormData) {
  const u = await requireRole(['admin']);
  await run('/admin/venues', () => reviewVenue(u, venueId, decision, String(fd.get('note') ?? '').slice(0, 300)));
  redirect('/admin/venues?ok=1');
}

export async function addStaffAction(venueId: string, fd: FormData) {
  const u = await manager();
  if (!UUID.test(venueId)) redirect('/owner');
  await run(`/owner/venues/${venueId}`, () => addStaff(u, venueId, String(fd.get('phone') ?? '')));
  redirect(`/owner/venues/${venueId}?ok=staff_added`);
}
export async function removeStaffAction(venueId: string, userId: string) {
  const u = await manager();
  if (!UUID.test(venueId) || !UUID.test(userId)) redirect('/owner');
  await run(`/owner/venues/${venueId}`, () => removeStaff(u, venueId, userId));
  redirect(`/owner/venues/${venueId}?ok=staff_removed`);
}
