import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { audit } from '@/server/audit';
import { E } from '@/server/booking/errors';
import { DEFAULTS, type SettingKey } from '@/server/settings';
import { normalizeDigits } from '@/lib/i18n/digits';
import type { Actor } from '@/server/owner/venues';

const admin = (a: Actor) => { if (a.role !== 'admin') throw E.forbidden(); };
const PAGE = 20;

export async function adminOverview(a: Actor) {
  admin(a);
  const [u] = await db().select({
    users: sql<number>`count(*)::int`, suspended: sql<number>`count(*) filter (where status='suspended')::int`,
    managers: sql<number>`count(*) filter (where role='venue_manager')::int`,
  }).from(schema.users);
  const [v] = await db().select({ pending: sql<number>`count(*) filter (where status='pending')::int`, published: sql<number>`count(*) filter (where status='published')::int`, total: sql<number>`count(*)::int` }).from(schema.venues);
  const [r] = await db().select({
    confirmed: sql<number>`count(*) filter (where status in ('confirmed','completed'))::int`,
    gmv: sql<number>`coalesce(sum(total_amount) filter (where status in ('confirmed','completed')),0)::int`,
    fees: sql<number>`coalesce(sum(fee_amount) filter (where status in ('confirmed','completed')),0)::int`,
  }).from(schema.reservations);
  const [rp] = await db().select({ open: sql<number>`count(*)::int` }).from(schema.reports).where(eq(schema.reports.status, 'open'));
  return { users: u, venues: v, reservations: r, openReports: rp.open };
}

export async function listUsers(a: Actor, q: { text?: string; role?: string; status?: string; page?: number }) {
  admin(a);
  const t = normalizeDigits((q.text ?? '').trim()).slice(0, 40).replace(/[%_]/g, '');
  const conds = [];
  if (t) conds.push(or(ilike(schema.users.displayName, `%${t}%`), ilike(schema.users.phoneE164, `%${t.replace(/^0/, '')}%`)));
  if (q.role && ['player', 'venue_manager', 'admin'].includes(q.role)) conds.push(eq(schema.users.role, q.role as 'player'));
  if (q.status && ['active', 'suspended'].includes(q.status)) conds.push(eq(schema.users.status, q.status as 'active'));
  const where = conds.length ? and(...conds) : undefined;
  const page = Math.max(1, q.page ?? 1);
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.users).where(where);
  const rows = await db().select({ id: schema.users.id, name: schema.users.displayName, phone: schema.users.phoneE164, role: schema.users.role, status: schema.users.status, createdAt: schema.users.createdAt })
    .from(schema.users).where(where).orderBy(desc(schema.users.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE)) };
}

/** Suspend / reactivate a user. Admins cannot be suspended and nobody can change their own status. Sessions die on suspension. */
export async function setUserStatus(a: Actor, userId: string, status: 'active' | 'suspended', note = '') {
  admin(a);
  if (userId === a.id) throw E.invalid('وضعیت حساب خودتان را نمی‌توانید تغییر دهید.');
  await db().transaction(async (tx) => {
    const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).for('update');
    if (!u || u.status === 'deleted') throw E.notFound();
    if (u.role === 'admin') throw E.invalid('حساب ادمین را نمی‌توان تعلیق کرد.');
    if (u.status === status) return;
    await tx.update(schema.users).set({ status }).where(eq(schema.users.id, userId));
    if (status === 'suspended') await tx.update(schema.userSessions).set({ revokedAt: new Date() }).where(and(eq(schema.userSessions.userId, userId), sql`revoked_at is null`));
    await tx.insert(schema.auditLogs).values({ actorId: a.id, action: `user.${status === 'suspended' ? 'suspend' : 'reactivate'}`, entity: 'user', entityId: userId, diff: { note: note.slice(0, 300) } });
  });
}

export async function setVenueSuspended(a: Actor, venueId: string, suspend: boolean, note = '') {
  admin(a);
  const from = suspend ? 'published' : 'suspended';
  const r = await db().update(schema.venues).set({ status: suspend ? 'suspended' : 'published' })
    .where(and(eq(schema.venues.id, venueId), eq(schema.venues.status, from as 'published'))).returning({ owner: schema.venues.ownerUserId, name: schema.venues.name });
  if (!r.length) throw E.badState();
  await db().insert(schema.notifications).values({ userId: r[0].owner, type: 'venue_review', title: suspend ? 'سالن شما تعلیق شد' : 'سالن شما دوباره فعال شد', body: note.slice(0, 300), link: `/owner/venues/${venueId}` });
  await audit(a.id, suspend ? 'venue.suspend' : 'venue.reinstate', 'venue', venueId, { note: note.slice(0, 300) });
}
export async function listManagedVenues(a: Actor) {
  admin(a);
  return db().select({ id: schema.venues.id, name: schema.venues.name, status: schema.venues.status, slug: schema.venues.slug, ratingCount: schema.venues.ratingCount })
    .from(schema.venues).where(inArray(schema.venues.status, ['published', 'suspended'])).orderBy(schema.venues.name);
}

/* ---------- platform settings, fee & cancellation policy ---------- */
export const EDITABLE: Record<'hold_minutes' | 'join_deadline_hours', { label: string; min: number; max: number; unit: string }> = {
  hold_minutes: { label: 'مهلت پرداخت (هولد)', min: 5, max: 60, unit: 'دقیقه' },
  join_deadline_hours: { label: 'مهلت پیش‌فرض پیوستن به سانس باز', min: 1, max: 168, unit: 'ساعت' },
};
export async function currentSettings() {
  const rows = await db().select().from(schema.platformSettings);
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(Object.keys(EDITABLE).map((k) => [k, typeof m.get(k) === 'number' ? (m.get(k) as number) : DEFAULTS[k as SettingKey]])) as Record<keyof typeof EDITABLE, number>;
}
export async function updateSetting(a: Actor, key: string, value: number) {
  admin(a);
  const def = EDITABLE[key as keyof typeof EDITABLE];
  if (!def) throw E.invalid('تنظیم نامعتبر است.');
  if (!Number.isInteger(value) || value < def.min || value > def.max) throw E.invalid(`${def.label} باید بین ${def.min} و ${def.max} ${def.unit} باشد.`);
  const [old] = await db().select().from(schema.platformSettings).where(eq(schema.platformSettings.key, key));
  await db().insert(schema.platformSettings).values({ key, value }).onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, updatedAt: new Date() } });
  await audit(a.id, 'settings.update', 'setting', key, { from: old?.value ?? DEFAULTS[key as SettingKey], to: value });
}

const feeIn = z.object({ percent: z.number().min(0).max(30), minToman: z.number().int().min(0).max(1_000_000) });
/** New fee policy row (append-only history). Existing reservations keep their snapshot; only new bookings use it. */
export async function createFeePolicy(a: Actor, raw: { percent: number; minToman: number }) {
  admin(a);
  const r = feeIn.safeParse(raw);
  if (!r.success) throw E.invalid('درصد کارمزد بین ۰ تا ۳۰ و حداقل کارمزد بین ۰ تا ۱٬۰۰۰٬۰۰۰ تومان باشد.');
  const bp = Math.round(r.data.percent * 100);
  const [row] = await db().insert(schema.feePolicies).values({ percentBp: bp, minToman: r.data.minToman, payer: 'player' }).returning();
  await audit(a.id, 'fee_policy.create', 'fee_policy', row.id, { percentBp: bp, minToman: r.data.minToman });
}
export const listFeePolicies = () => db().select().from(schema.feePolicies).orderBy(desc(schema.feePolicies.activeFrom)).limit(10);

const tiersIn = z.array(z.object({ minHoursBefore: z.number().int().min(0).max(720), refundPercent: z.number().int().min(0).max(100) })).min(1).max(6);
export function validateTiers(raw: unknown) {
  const r = tiersIn.safeParse(raw);
  if (!r.success) throw E.invalid('پلکان‌های لغو معتبر نیست.');
  const tiers = [...r.data].sort((x, y) => y.minHoursBefore - x.minHoursBefore);
  if (new Set(tiers.map((t) => t.minHoursBefore)).size !== tiers.length) throw E.invalid('ساعت‌های تکراری مجاز نیست.');
  if (tiers[tiers.length - 1].minHoursBefore !== 0) throw E.invalid('آخرین پلکان باید «۰ ساعت» باشد تا همهٔ حالت‌ها پوشش داده شود.');
  for (let i = 1; i < tiers.length; i++) if (tiers[i].refundPercent > tiers[i - 1].refundPercent) throw E.invalid('درصد بازگشت با نزدیک‌شدن به بازی نباید بیشتر شود.');
  return tiers;
}
/** New immutable policy VERSION; old reservations keep the version/snapshot they were booked under. */
export async function createCancellationPolicy(a: Actor, raw: unknown) {
  admin(a);
  const tiers = validateTiers(raw);
  const v = await db().transaction(async (tx) => {
    await tx.execute(sql`lock table cancellation_policies in share row exclusive mode`);
    const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(version),0)::int` }).from(schema.cancellationPolicies);
    await tx.insert(schema.cancellationPolicies).values({ version: m + 1, tiers });
    return m + 1;
  });
  await audit(a.id, 'cancellation_policy.create', 'cancellation_policy', String(v), { tiers });
  return v;
}
export const listCancellationPolicies = () => db().select().from(schema.cancellationPolicies).orderBy(desc(schema.cancellationPolicies.version)).limit(5);

/* ---------- audit log viewer ---------- */
export async function listAudit(a: Actor, q: { action?: string; page?: number }) {
  admin(a);
  const page = Math.max(1, q.page ?? 1);
  const where = q.action ? ilike(schema.auditLogs.action, `${q.action.replace(/[%_]/g, '').slice(0, 40)}%`) : undefined;
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.auditLogs).where(where);
  const rows = await db().select({ id: schema.auditLogs.id, action: schema.auditLogs.action, entity: schema.auditLogs.entity, entityId: schema.auditLogs.entityId, diff: schema.auditLogs.diff, createdAt: schema.auditLogs.createdAt, actor: schema.users.displayName })
    .from(schema.auditLogs).leftJoin(schema.users, eq(schema.users.id, schema.auditLogs.actorId)).where(where).orderBy(desc(schema.auditLogs.createdAt)).limit(PAGE * 2).offset((page - 1) * PAGE * 2);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / (PAGE * 2))) };
}
