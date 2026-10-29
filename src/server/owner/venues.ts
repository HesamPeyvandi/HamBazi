import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { audit } from '@/server/audit';
import { DomainError, E } from '@/server/booking/errors';
import { lockSlot } from '@/server/booking/lifecycle';
import { FACILITIES } from '@/lib/facilities';
import { deleteImage, storeImage } from '@/server/storage';
import { tehranWallToUtc } from '@/lib/i18n/jalali';
import { normalizeIranMobile } from '@/lib/i18n/phone';

export interface Actor { id: string; role: 'player' | 'venue_manager' | 'admin' }
const MAX_IMAGES = 10;

/** level 'staff' = any manager row (slots, reservations, attendance); 'owner' = venue content, images, submit, staff list. */
export async function assertManages(actor: Actor, venueId: string, level: 'staff' | 'owner' = 'staff') {
  if (actor.role === 'admin') return;
  const [m] = await db().select().from(schema.venueManagers).where(and(eq(schema.venueManagers.venueId, venueId), eq(schema.venueManagers.userId, actor.id)));
  if (!m) throw E.notFound(); // never reveal whether another owner's venue exists
  if (level === 'owner' && m.role !== 'owner') throw E.forbidden();
}

export async function listStaff(actor: Actor, venueId: string) {
  await assertManages(actor, venueId, 'owner');
  return db().select({ userId: schema.venueManagers.userId, role: schema.venueManagers.role, name: schema.users.displayName, phone: schema.users.phoneE164 })
    .from(schema.venueManagers).innerJoin(schema.users, eq(schema.users.id, schema.venueManagers.userId)).where(eq(schema.venueManagers.venueId, venueId));
}
export async function addStaff(actor: Actor, venueId: string, phoneInput: string) {
  await assertManages(actor, venueId, 'owner');
  const phone = normalizeIranMobile(phoneInput);
  if (!phone) throw E.invalid('شمارهٔ موبایل معتبر نیست.');
  const [u] = await db().select().from(schema.users).where(eq(schema.users.phoneE164, phone));
  if (!u || u.status !== 'active') throw E.invalid('کاربری با این شماره در همبازی ثبت‌نام نکرده است.');
  if (u.role === 'admin') throw E.invalid('این کاربر مدیر سامانه است و نیازی به افزودن ندارد.');
  const [ex] = await db().select().from(schema.venueManagers).where(and(eq(schema.venueManagers.venueId, venueId), eq(schema.venueManagers.userId, u.id)));
  if (ex) throw E.invalid('این کاربر قبلاً به سالن اضافه شده است.');
  await db().transaction(async (tx) => {
    if (u.role === 'player') await tx.update(schema.users).set({ role: 'venue_manager' }).where(eq(schema.users.id, u.id));
    await tx.insert(schema.venueManagers).values({ venueId, userId: u.id, role: 'staff' });
  });
  await audit(actor.id, 'venue.staff_add', 'venue', venueId, { userId: u.id });
}
export async function removeStaff(actor: Actor, venueId: string, userId: string) {
  await assertManages(actor, venueId, 'owner');
  const r = await db().delete(schema.venueManagers).where(and(eq(schema.venueManagers.venueId, venueId), eq(schema.venueManagers.userId, userId), eq(schema.venueManagers.role, 'staff'))).returning();
  if (!r.length) throw E.notFound();
  await audit(actor.id, 'venue.staff_remove', 'venue', venueId, { userId });
}

/** Open sessions at the venues the actor manages, with participant counts. */
export async function listOwnerSessions(actor: Actor) {
  const scope = actor.role === 'admin' ? undefined : inArray(schema.openSessions.venueId, db().select({ id: schema.venueManagers.venueId }).from(schema.venueManagers).where(eq(schema.venueManagers.userId, actor.id)));
  const rows = await db().select({ s: schema.openSessions, venueName: schema.venues.name, sportName: schema.sports.nameFa, startsAt: schema.timeSlots.startsAt, hostName: schema.users.displayName,
    confirmed: sql<number>`(select count(*)::int from session_participants p where p.session_id = ${schema.openSessions.id} and p.status in ('confirmed','attended'))`,
    pending: sql<number>`(select count(*)::int from session_participants p where p.session_id = ${schema.openSessions.id} and p.status = 'pending_payment')` })
    .from(schema.openSessions).innerJoin(schema.venues, eq(schema.venues.id, schema.openSessions.venueId)).innerJoin(schema.sports, eq(schema.sports.id, schema.openSessions.sportId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.openSessions.slotId)).innerJoin(schema.users, eq(schema.users.id, schema.openSessions.hostUserId))
    .where(and(scope, sql`${schema.timeSlots.endsAt} > now()`, inArray(schema.openSessions.status, ['collecting', 'confirmed']))).orderBy(asc(schema.timeSlots.startsAt)).limit(200);
  return rows;
}

/** Self-service upgrade: a player becomes a venue manager (audit-logged). Admins stay admins. */
export async function becomeVenueManager(userId: string) {
  const r = await db().update(schema.users).set({ role: 'venue_manager' }).where(and(eq(schema.users.id, userId), eq(schema.users.role, 'player'))).returning({ id: schema.users.id });
  if (r.length) await audit(userId, 'user.become_venue_manager', 'user', userId, {});
}

const sportLine = z.object({ sportId: z.string().uuid(), price: z.number().int().min(10_000).max(50_000_000), minutes: z.number().int().min(30).max(240), maxCapacity: z.number().int().min(2).max(60) });
export const venueInput = z.object({
  name: z.string().trim().min(3, 'نام سالن حداقل ۳ حرف باشد.').max(80),
  cityId: z.string().uuid(), address: z.string().trim().min(5, 'آدرس را کامل‌تر وارد کنید.').max(250),
  neighborhood: z.string().trim().max(60).default(''), description: z.string().trim().max(1500).default(''),
  surface: z.string().trim().max(60).optional(), openHours: z.string().trim().max(80).optional(),
  rules: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  facilities: z.array(z.string()).default([]), sports: z.array(sportLine).min(1, 'حداقل یک ورزش با قیمت لازم است.'),
});
export type VenueInput = z.infer<typeof venueInput>;

function parse(input: unknown): VenueInput {
  const r = venueInput.safeParse(input);
  if (!r.success) throw new DomainError('invalid', r.error.issues[0]?.message ?? 'اطلاعات معتبر نیست.');
  const dup = new Set(r.data.sports.map((s) => s.sportId));
  if (dup.size !== r.data.sports.length) throw E.invalid('یک ورزش فقط یک‌بار قابل ثبت است.');
  return { ...r.data, facilities: r.data.facilities.filter((f) => f in FACILITIES) };
}
const cap = (i: VenueInput) => Math.max(...i.sports.map((s) => s.maxCapacity));

async function writeChildren(tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0], venueId: string, i: VenueInput) {
  await tx.delete(schema.venueFacilities).where(eq(schema.venueFacilities.venueId, venueId));
  if (i.facilities.length) await tx.insert(schema.venueFacilities).values(i.facilities.map((facilityKey) => ({ venueId, facilityKey })));
  await tx.delete(schema.venueSports).where(eq(schema.venueSports.venueId, venueId));
  await tx.insert(schema.venueSports).values(i.sports.map((s) => ({ venueId, sportId: s.sportId, pricePerSlot: s.price, slotMinutes: s.minutes, maxCapacity: s.maxCapacity })));
}

/** New venues start as draft; the owner submits them for admin review. */
export async function createVenue(actor: Actor, raw: unknown) {
  if (actor.role === 'player') throw E.forbidden();
  const i = parse(raw);
  return db().transaction(async (tx) => {
    const [v] = await tx.insert(schema.venues).values({
      ownerUserId: actor.id, cityId: i.cityId, slug: `v-${randomBytes(5).toString('hex')}`, name: i.name, description: i.description, address: i.address,
      neighborhood: i.neighborhood, surface: i.surface, openHours: i.openHours, rules: i.rules, capacity: cap(i), status: 'draft',
    }).returning();
    await tx.insert(schema.venueManagers).values({ venueId: v.id, userId: actor.id, role: 'owner' });
    await writeChildren(tx, v.id, i);
    return v;
  });
}

export async function updateVenue(actor: Actor, venueId: string, raw: unknown) {
  await assertManages(actor, venueId, 'owner');
  const i = parse(raw);
  await db().transaction(async (tx) => {
    // sports that already have slots/reservations cannot be dropped
    const [venue] = await tx.select().from(schema.venues).where(eq(schema.venues.id, venueId)).for('update');
    if (!venue) throw E.notFound();
    const keep = new Set(i.sports.map((s) => s.sportId));
    const used = await tx.selectDistinct({ id: schema.timeSlots.sportId }).from(schema.timeSlots).where(eq(schema.timeSlots.venueId, venueId));
    if (used.some((u) => !keep.has(u.id))) throw E.invalid('ورزشی که برایش سانس ثبت شده را نمی‌توان حذف کرد.');
    await tx.update(schema.venues).set({ name: i.name, cityId: i.cityId, address: i.address, neighborhood: i.neighborhood, description: i.description, surface: i.surface, openHours: i.openHours, rules: i.rules, capacity: cap(i) }).where(eq(schema.venues.id, venueId));
    await writeChildren(tx, venueId, i);
  });
  await audit(actor.id, 'venue.update', 'venue', venueId, {});
}

export async function submitForReview(actor: Actor, venueId: string) {
  await assertManages(actor, venueId, 'owner');
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.venueImages).where(eq(schema.venueImages.venueId, venueId));
  if (n === 0) throw E.invalid('قبل از ارسال برای تأیید، حداقل یک عکس آپلود کنید.');
  const r = await db().update(schema.venues).set({ status: 'pending' }).where(and(eq(schema.venues.id, venueId), eq(schema.venues.status, 'draft'))).returning({ id: schema.venues.id });
  if (!r.length) throw E.badState();
  await audit(actor.id, 'venue.submit', 'venue', venueId, {});
}

export async function reviewVenue(admin: Actor, venueId: string, decision: 'approve' | 'reject', note = '') {
  if (admin.role !== 'admin') throw E.forbidden();
  const r = await db().update(schema.venues).set({ status: decision === 'approve' ? 'published' : 'draft' }).where(and(eq(schema.venues.id, venueId), eq(schema.venues.status, 'pending'))).returning();
  if (!r.length) throw E.badState();
  await db().insert(schema.notifications).values({ userId: r[0].ownerUserId, type: 'venue_review', title: decision === 'approve' ? 'سالن شما تأیید شد' : 'سالن شما نیاز به اصلاح دارد',
    body: decision === 'approve' ? 'اکنون می‌توانید سانس‌ها را باز کنید.' : (note || 'لطفاً اطلاعات را بازبینی و دوباره ارسال کنید.'), link: `/owner/venues/${venueId}` });
  await audit(admin.id, `venue.${decision}`, 'venue', venueId, { note });
}

export async function addVenueImage(actor: Actor, venueId: string, data: Buffer) {
  await assertManages(actor, venueId, 'owner');
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.venueImages).where(eq(schema.venueImages.venueId, venueId));
  if (n >= MAX_IMAGES) throw E.invalid(`حداکثر ${MAX_IMAGES} عکس مجاز است.`);
  const key = await storeImage(data, `venues/${venueId}`);
  await db().insert(schema.venueImages).values({ venueId, storageKey: key, sort: n });
}
export async function removeVenueImage(actor: Actor, venueId: string, imageId: string) {
  await assertManages(actor, venueId, 'owner');
  const r = await db().delete(schema.venueImages).where(and(eq(schema.venueImages.id, imageId), eq(schema.venueImages.venueId, venueId))).returning();
  if (!r.length) throw E.notFound();
  await deleteImage(r[0].storageKey);
}

/* ------------------------------ slots ------------------------------ */
export interface SlotBatch { sportId: string; days: { y: number; m: number; d: number }[]; startHour: number; startMin: number; endHour: number; price?: number }

/** Generates back-to-back slots inside the window. Overlaps and duplicates are skipped (the database constraint is the final guard). */
export async function createSlots(actor: Actor, venueId: string, b: SlotBatch, now = new Date()) {
  await assertManages(actor, venueId);
  const [vn] = await db().select().from(schema.venues).where(eq(schema.venues.id, venueId));
  if (vn?.status !== 'published') throw E.invalid('سانس‌ها پس از تأیید سالن توسط مدیر سامانه قابل ایجاد هستند.');
  const [vs] = await db().select().from(schema.venueSports).where(and(eq(schema.venueSports.venueId, venueId), eq(schema.venueSports.sportId, b.sportId)));
  if (!vs) throw E.invalid('این ورزش برای سالن ثبت نشده است.');
  const price = b.price ?? vs.pricePerSlot;
  if (!Number.isInteger(price) || price < 10_000) throw E.invalid('قیمت معتبر نیست.');
  if (b.days.length === 0 || b.days.length > 31) throw E.invalid('تعداد روزها معتبر نیست.');
  let created = 0, skipped = 0;
  for (const day of b.days) {
    let t = b.startHour * 60 + b.startMin;
    const end = b.endHour * 60;
    while (t + vs.slotMinutes <= end) {
      const startsAt = tehranWallToUtc(day.y, day.m, day.d, Math.floor(t / 60), t % 60);
      const endsAt = new Date(startsAt.getTime() + vs.slotMinutes * 60_000);
      t += vs.slotMinutes;
      if (startsAt <= now) { skipped++; continue; }
      try {
        await db().transaction((tx) => tx.insert(schema.timeSlots).values({ venueId, sportId: b.sportId, startsAt, endsAt, price }));
        created++;
      } catch (e) {
        const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
        if (code === '23P01' || code === '23505') skipped++; else throw e;
      }
    }
  }
  await audit(actor.id, 'slots.create', 'venue', venueId, { created, skipped });
  return { created, skipped };
}

/** Owner opens/closes a slot. Held/booked slots are untouchable (cancel the reservation instead). */
export async function setSlotOpen(actor: Actor, slotId: string, open: boolean) {
  return db().transaction(async (tx) => {
    const slot = await lockSlot(tx, slotId);
    if (!slot) throw E.notFound();
    await assertManages(actor, slot.venueId);
    if (!['open', 'closed'].includes(slot.status)) throw E.badState();
    await tx.update(schema.timeSlots).set({ status: open ? 'open' : 'closed', version: slot.version + 1 }).where(eq(schema.timeSlots.id, slotId));
  });
}
export async function deleteSlot(actor: Actor, slotId: string) {
  return db().transaction(async (tx) => {
    const slot = await lockSlot(tx, slotId);
    if (!slot) throw E.notFound();
    await assertManages(actor, slot.venueId);
    if (!['open', 'closed'].includes(slot.status)) throw E.badState();
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.reservations).where(eq(schema.reservations.slotId, slotId));
    if (n > 0) { await tx.update(schema.timeSlots).set({ status: 'closed' }).where(eq(schema.timeSlots.id, slotId)); return; } // has history: keep, just close
    await tx.delete(schema.timeSlots).where(eq(schema.timeSlots.id, slotId));
  });
}

/* ------------------------------ queries ------------------------------ */
export async function listOwnerVenues(actor: Actor) {
  const where = actor.role === 'admin' ? undefined : inArray(schema.venues.id, db().select({ id: schema.venueManagers.venueId }).from(schema.venueManagers).where(eq(schema.venueManagers.userId, actor.id)));
  return db().select().from(schema.venues).where(where).orderBy(desc(schema.venues.createdAt));
}
export async function getOwnerVenue(actor: Actor, venueId: string) {
  await assertManages(actor, venueId);
  const d = db();
  const [venue] = await d.select().from(schema.venues).where(eq(schema.venues.id, venueId));
  const [images, facilities, sports] = await Promise.all([
    d.select().from(schema.venueImages).where(eq(schema.venueImages.venueId, venueId)).orderBy(asc(schema.venueImages.sort)),
    d.select().from(schema.venueFacilities).where(eq(schema.venueFacilities.venueId, venueId)),
    d.select().from(schema.venueSports).where(eq(schema.venueSports.venueId, venueId)),
  ]);
  const isOwner = actor.role === 'admin' || (await d.select().from(schema.venueManagers).where(and(eq(schema.venueManagers.venueId, venueId), eq(schema.venueManagers.userId, actor.id), eq(schema.venueManagers.role, 'owner')))).length > 0;
  return { venue, images, facilities: facilities.map((f) => f.facilityKey), sports, isOwner };
}
export async function listOwnerSlots(actor: Actor, venueId: string) {
  await assertManages(actor, venueId);
  return db().select({ slot: schema.timeSlots, sportName: schema.sports.nameFa }).from(schema.timeSlots).innerJoin(schema.sports, eq(schema.sports.id, schema.timeSlots.sportId))
    .where(and(eq(schema.timeSlots.venueId, venueId), sql`${schema.timeSlots.endsAt} > now()`)).orderBy(asc(schema.timeSlots.startsAt)).limit(300);
}
export async function listOwnerReservations(actor: Actor) {
  const ids = actor.role === 'admin' ? undefined : inArray(schema.reservations.venueId, db().select({ id: schema.venueManagers.venueId }).from(schema.venueManagers).where(eq(schema.venueManagers.userId, actor.id)));
  return db().select({ r: schema.reservations, venueName: schema.venues.name, hostName: schema.users.displayName, startsAt: schema.timeSlots.startsAt, sportName: schema.sports.nameFa })
    .from(schema.reservations).innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId)).innerJoin(schema.users, eq(schema.users.id, schema.reservations.hostUserId))
    .innerJoin(schema.timeSlots, eq(schema.timeSlots.id, schema.reservations.slotId)).innerJoin(schema.sports, eq(schema.sports.id, schema.reservations.sportId))
    .where(ids).orderBy(desc(schema.timeSlots.startsAt)).limit(200);
}
export async function listPendingVenues(admin: Actor) {
  if (admin.role !== 'admin') throw E.forbidden();
  return db().select({ v: schema.venues, owner: schema.users.displayName, phone: schema.users.phoneE164 }).from(schema.venues).innerJoin(schema.users, eq(schema.users.id, schema.venues.ownerUserId))
    .where(eq(schema.venues.status, 'pending')).orderBy(asc(schema.venues.createdAt));
}
