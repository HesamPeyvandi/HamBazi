import {
  pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb, doublePrecision, numeric, bigint,
  uniqueIndex, index, primaryKey, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum('user_role', ['player', 'venue_manager', 'admin']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'deleted']);
export const venueStatusEnum = pgEnum('venue_status', ['draft', 'pending', 'published', 'suspended']);
export const slotStatusEnum = pgEnum('slot_status', ['open', 'closed', 'held', 'booked']);

/* ---------- geography & sports ---------- */
export const cities = pgTable('cities', {
  id: id(),
  nameFa: text('name_fa').notNull(),
  slug: text('slug').notNull().unique(),
  isDefault: boolean('is_default').notNull().default(false),
});

export const sports = pgTable('sports', {
  id: id(),
  key: text('key').notNull().unique(), // futsal | volleyball
  nameFa: text('name_fa').notNull(),
  defaultCapacity: integer('default_capacity').notNull(),
  skillCategories: jsonb('skill_categories').$type<{ key: string; nameFa: string }[]>().notNull(),
  active: boolean('active').notNull().default(true),
});

/* ---------- identity ---------- */
export const users = pgTable('users', {
  id: id(),
  phoneE164: text('phone_e164').notNull().unique(),
  displayName: text('display_name').notNull().default(''),
  avatarUrl: text('avatar_url'),
  role: roleEnum('role').notNull().default('player'),
  status: userStatusEnum('status').notNull().default('active'),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'restrict' }),
  cityId: uuid('city_id').references(() => cities.id),
  bio: text('bio').notNull().default(''),
  preferredSports: jsonb('preferred_sports').$type<string[]>().notNull().default([]),
  preferredTime: text('preferred_time'), // morning | afternoon | evening | night
  privacy: jsonb('privacy').$type<{ showProfile: boolean; showHistory: boolean }>()
    .notNull().default({ showProfile: true, showHistory: true }),
  notifPrefs: jsonb('notif_prefs').$type<Record<string, boolean>>().notNull().default({}),
  referralCode: text('referral_code').unique(),
  referredBy: uuid('referred_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authChallenges = pgTable('auth_challenges', {
  id: id(),
  phoneE164: text('phone_e164').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  usedAt: timestamp('used_at', { withTimezone: true }),
  invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
  ipHash: text('ip_hash'),
  meta: jsonb('meta').$type<{ name?: string; referral?: string }>(),
  createdAt: createdAt(),
}, (t) => [index('auth_challenges_phone_idx').on(t.phoneE164, t.createdAt)]);

export const userSessions = pgTable('user_sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: createdAt(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ipHash: text('ip_hash'),
  userAgent: text('user_agent'),
}, (t) => [index('user_sessions_user_idx').on(t.userId)]);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] })]);

/* ---------- venues ---------- */
export const venues = pgTable('venues', {
  id: id(),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  cityId: uuid('city_id').notNull().references(() => cities.id),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  address: text('address').notNull(),
  neighborhood: text('neighborhood').notNull().default(''),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  status: venueStatusEnum('status').notNull().default('draft'),
  ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }).notNull().default('0'),
  ratingCount: integer('rating_count').notNull().default(0),
  capacity: integer('capacity').notNull().default(20),
  surface: text('surface'),
  openHours: text('open_hours'),
  rules: jsonb('rules').$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
}, (t) => [
  index('venues_city_status_idx').on(t.cityId, t.status),
  check('venues_rating_range', sql`${t.ratingAvg} >= 0 AND ${t.ratingAvg} <= 5`),
]);

export const venueManagers = pgTable('venue_managers', {
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  role: text('role').notNull().default('owner'), // owner | staff
}, (t) => [primaryKey({ columns: [t.venueId, t.userId] })]);

export const venueImages = pgTable('venue_images', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  alt: text('alt').notNull().default(''),
  sort: integer('sort').notNull().default(0),
}, (t) => [index('venue_images_venue_idx').on(t.venueId, t.sort)]);

export const venueFacilities = pgTable('venue_facilities', {
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  facilityKey: text('facility_key').notNull(),
}, (t) => [primaryKey({ columns: [t.venueId, t.facilityKey] })]);

export const venueSports = pgTable('venue_sports', {
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  pricePerSlot: integer('price_per_slot').notNull(), // integer toman
  slotMinutes: integer('slot_minutes').notNull().default(90),
  maxCapacity: integer('max_capacity').notNull(), // physical capacity
}, (t) => [
  primaryKey({ columns: [t.venueId, t.sportId] }),
  check('venue_sports_price_pos', sql`${t.pricePerSlot} > 0`),
]);

export const timeSlots = pgTable('time_slots', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  price: integer('price').notNull(),
  status: slotStatusEnum('status').notNull().default('open'),
  version: integer('version').notNull().default(0),
}, (t) => [
  uniqueIndex('time_slots_unique_start').on(t.venueId, t.sportId, t.startsAt),
  index('time_slots_search_idx').on(t.status, t.startsAt),
  check('time_slots_order', sql`${t.endsAt} > ${t.startsAt}`),
  // Overlap prevention per (venue, sport) is added in a custom SQL migration (EXCLUDE USING gist).
]);

/* ---------- reviews (display in P1, submission logic in P3) ---------- */
export const venueReviews = pgTable('venue_reviews', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  sessionId: uuid('session_id'),
  reservationId: uuid('reservation_id'), // the game being reviewed (full or open session); unique per (reservation, user)
  rating: integer('rating').notNull(),
  quality: jsonb('quality').$type<Record<string, number>>().notNull().default({}),
  comment: text('comment').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [
  check('venue_reviews_rating', sql`${t.rating} BETWEEN 1 AND 5`),
  index('venue_reviews_venue_idx').on(t.venueId, t.createdAt),
  uniqueIndex('venue_reviews_one_per_game').on(t.reservationId, t.userId).where(sql`${t.reservationId} IS NOT NULL`),
]);

/* ---------- player skill (self-assessment in P1; peer ratings in P3) ---------- */
export const playerSportProfiles = pgTable('player_sport_profiles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  selfScores: jsonb('self_scores').$type<Record<string, number>>().notNull().default({}),
  peerScores: jsonb('peer_scores').$type<Record<string, { sum: number; n: number }>>().notNull().default({}),
  level: text('level').notNull().default('intermediate'), // beginner | intermediate | pro
  ovr: integer('ovr').notNull().default(50),
  peerCount: integer('peer_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.sportId] }), check('psp_ovr', sql`${t.ovr} BETWEEN 0 AND 99`)]);

/* ---------- platform ---------- */
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  diff: jsonb('diff'),
  createdAt: createdAt(),
}, (t) => [index('audit_entity_idx').on(t.entity, t.entityId)]);

/** Mock SMS outbox. Written ONLY by the mock provider (development/demo). Never used in production. */
export const devSmsOutbox = pgTable('dev_sms_outbox', {
  id: id(),
  phoneE164: text('phone_e164').notNull(),
  message: text('message').notNull(),
  code: text('code').notNull(),
  createdAt: createdAt(),
}, (t) => [index('dev_sms_phone_idx').on(t.phoneE164, t.createdAt)]);

/* =====================  PHASE 2: booking core  ===================== */
export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending', 'awaiting_payment', 'confirmed', 'cancelled', 'completed', 'expired', 'refund_pending', 'refunded', 'failed',
]);
export const sessionStatusEnum = pgEnum('session_status', ['collecting', 'confirmed', 'cancelled', 'completed', 'expired']);
export const participantStatusEnum = pgEnum('participant_status', [
  'pending_payment', 'confirmed', 'left', 'removed', 'expired', 'no_show', 'attended',
]);
export const claimStatusEnum = pgEnum('claim_status', ['held', 'confirmed', 'released']);
export const paymentModeEnum = pgEnum('payment_mode', ['simulated', 'live']);
export const paymentStatusEnum = pgEnum('payment_status', ['created', 'succeeded', 'failed', 'cancelled', 'refund_pending', 'refunded']);

export const feePolicies = pgTable('fee_policies', {
  id: id(),
  percentBp: integer('percent_bp').notNull(),     // basis points: 500 = 5%
  minToman: integer('min_toman').notNull().default(0),
  payer: text('payer').notNull().default('player'), // player | venue (venue-side commission supported by the model)
  activeFrom: timestamp('active_from', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('fee_bp_range', sql`${t.percentBp} BETWEEN 0 AND 5000`)]);

export const cancellationPolicies = pgTable('cancellation_policies', {
  version: integer('version').primaryKey(),
  /** sorted descending by minHoursBefore. refundPercent applies to the amount paid. */
  tiers: jsonb('tiers').$type<{ minHoursBefore: number; refundPercent: number }[]>().notNull(),
  activeFrom: timestamp('active_from', { withTimezone: true }).notNull().defaultNow(),
});

export const reservations = pgTable('reservations', {
  id: id(),
  hostUserId: uuid('host_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' }),
  slotId: uuid('slot_id').notNull().references(() => timeSlots.id, { onDelete: 'restrict' }),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  mode: text('mode').notNull(),                       // full | open_session
  paymentArrangement: text('payment_arrangement').notNull(), // single | split
  status: reservationStatusEnum('status').notNull().default('awaiting_payment'),
  policyVersion: integer('policy_version').notNull().references(() => cancellationPolicies.version),
  policySnapshot: jsonb('policy_snapshot').$type<{ tiers: { minHoursBefore: number; refundPercent: number }[] }>().notNull(),
  feeSnapshot: jsonb('fee_snapshot').$type<{ percentBp: number; minToman: number; payer: string }>().notNull(),
  baseAmount: integer('base_amount').notNull(),       // slot price (venue price)
  feeAmount: integer('fee_amount').notNull().default(0),
  totalAmount: integer('total_amount').notNull(),     // what the full-mode payer pays (base + fee)
  venuePayable: integer('venue_payable').notNull(),
  holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  cancelledBy: text('cancelled_by'),                  // player | venue | system | admin
  attendance: text('attendance'),                     // full-mode host only: attended | no_show (sessions use participant status)
  attendanceMarkedAt: timestamp('attendance_marked_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  version: integer('version').notNull().default(0),
}, (t) => [
  index('reservations_host_idx').on(t.hostUserId, t.createdAt),
  index('reservations_venue_idx').on(t.venueId, t.status),
  index('reservations_slot_idx').on(t.slotId),
  check('reservations_amounts', sql`${t.baseAmount} > 0 AND ${t.feeAmount} >= 0 AND ${t.totalAmount} >= ${t.baseAmount}`),
]);

export const slotClaims = pgTable('slot_claims', {
  id: id(),
  slotId: uuid('slot_id').notNull().references(() => timeSlots.id, { onDelete: 'restrict' }),
  reservationId: uuid('reservation_id').notNull().references(() => reservations.id, { onDelete: 'restrict' }),
  status: claimStatusEnum('status').notNull().default('held'),
  holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  // THE double-booking guard: at most one active claim per slot.
  uniqueIndex('slot_claims_one_active').on(t.slotId).where(sql`${t.status} IN ('held','confirmed')`),
]);

export const openSessions = pgTable('open_sessions', {
  id: id(),
  reservationId: uuid('reservation_id').notNull().unique().references(() => reservations.id, { onDelete: 'restrict' }),
  hostUserId: uuid('host_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' }),
  slotId: uuid('slot_id').notNull().references(() => timeSlots.id, { onDelete: 'restrict' }),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  targetCount: integer('target_count').notNull(),     // host target (NOT the venue capacity)
  minToConfirm: integer('min_to_confirm').notNull(),
  skillMin: integer('skill_min').notNull().default(0),
  skillMax: integer('skill_max').notNull().default(99),
  pricePerParticipant: integer('price_per_participant').notNull(),
  joinDeadline: timestamp('join_deadline', { withTimezone: true }).notNull(),
  visibility: text('visibility').notNull().default('public'), // public | invite_only
  inviteToken: text('invite_token').notNull().unique(),
  description: text('description').notNull().default(''),
  status: sessionStatusEnum('status').notNull().default('collecting'),
  cancelReason: text('cancel_reason'),
  createdAt: createdAt(),
  version: integer('version').notNull().default(0),
}, (t) => [
  index('open_sessions_browse_idx').on(t.status, t.joinDeadline),
  check('open_sessions_counts', sql`${t.targetCount} >= 2 AND ${t.minToConfirm} >= 2 AND ${t.minToConfirm} <= ${t.targetCount}`),
  check('open_sessions_skill', sql`${t.skillMin} >= 0 AND ${t.skillMax} <= 99 AND ${t.skillMin} <= ${t.skillMax}`),
]);

export const sessionParticipants = pgTable('session_participants', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => openSessions.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  isHost: boolean('is_host').notNull().default(false),
  status: participantStatusEnum('status').notNull().default('pending_payment'),
  holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
  amount: integer('amount').notNull(),               // base amount (price per participant)
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('session_participants_unique').on(t.sessionId, t.userId), // no double join
  index('session_participants_user_idx').on(t.userId, t.status),
]);

export const paymentIntents = pgTable('payment_intents', {
  id: id(),
  payerUserId: uuid('payer_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reservationId: uuid('reservation_id').notNull().references(() => reservations.id, { onDelete: 'restrict' }),
  participantId: uuid('participant_id').references(() => sessionParticipants.id, { onDelete: 'restrict' }),
  baseAmount: integer('base_amount').notNull(),
  feeAmount: integer('fee_amount').notNull(),
  amount: integer('amount').notNull(),               // total charged = base + fee (integer toman)
  venuePayable: integer('venue_payable').notNull(),
  mode: paymentModeEnum('mode').notNull(),           // immutable (trigger)
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  status: paymentStatusEnum('status').notNull().default('created'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  feeSnapshot: jsonb('fee_snapshot').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('payment_intents_res_idx').on(t.reservationId),
  // one live (created/succeeded) intent per payer target
  uniqueIndex('payment_intents_one_active').on(t.reservationId, t.payerUserId).where(sql`${t.status} IN ('created','succeeded')`),
  check('payment_amounts', sql`${t.amount} = ${t.baseAmount} + ${t.feeAmount} AND ${t.amount} > 0`),
]);

export const paymentEvents = pgTable('payment_events', {
  id: id(),
  intentId: uuid('intent_id').notNull().references(() => paymentIntents.id, { onDelete: 'restrict' }),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  payload: jsonb('payload'),
  createdAt: createdAt(),
}, (t) => [index('payment_events_intent_idx').on(t.intentId)]);

export const refunds = pgTable('refunds', {
  id: id(),
  intentId: uuid('intent_id').notNull().unique().references(() => paymentIntents.id, { onDelete: 'restrict' }), // one refund per payment
  amount: integer('amount').notNull(),
  percent: integer('percent').notNull(),
  mode: paymentModeEnum('mode').notNull(),
  status: text('status').notNull().default('succeeded'), // simulated: recorded state only
  reason: text('reason').notNull(),
  createdAt: createdAt(),
}, (t) => [check('refund_positive', sql`${t.amount} >= 0 AND ${t.percent} BETWEEN 0 AND 100`)]);

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  link: text('link'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)]);

export const jobRuns = pgTable('job_runs', {
  id: id(),
  name: text('name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  result: jsonb('result'),
});

/* ---------- Phase 3: trust (attendance, reliability, peer ratings, reports) ---------- */
/** Reliability is DERIVED from these events (recomputable). One event per (user, game, type). */
export const reliabilityEvents = pgTable('reliability_events', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reservationId: uuid('reservation_id').notNull().references(() => reservations.id, { onDelete: 'restrict' }),
  type: text('type').notNull(), // attended | no_show | late_cancel
  delta: integer('delta').notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('reliability_one_per_game').on(t.userId, t.reservationId, t.type),
  index('reliability_user_idx').on(t.userId, t.createdAt),
  check('reliability_type', sql`${t.type} IN ('attended','no_show','late_cancel')`),
]);

export const venueReliabilityEvents = pgTable('venue_reliability_events', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' }),
  reservationId: uuid('reservation_id').notNull().references(() => reservations.id, { onDelete: 'restrict' }),
  type: text('type').notNull(), // cancelled_by_venue
  createdAt: createdAt(),
}, (t) => [uniqueIndex('venue_reliability_one').on(t.venueId, t.reservationId, t.type)]);

export const playerReviews = pgTable('player_reviews', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => openSessions.id, { onDelete: 'restrict' }),
  raterId: uuid('rater_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  targetId: uuid('target_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  scores: jsonb('scores').$type<Record<string, number>>().notNull(), // category -> 1..10
  comment: text('comment').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('player_reviews_unique').on(t.sessionId, t.raterId, t.targetId),
  index('player_reviews_target_idx').on(t.targetId, t.createdAt),
  check('player_reviews_not_self', sql`${t.raterId} <> ${t.targetId}`),
]);

export const reports = pgTable('reports', {
  id: id(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  targetType: text('target_type').notNull(), // user | venue | session
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  details: text('details').notNull().default(''),
  status: text('status').notNull().default('open'), // open | resolved | dismissed
  resolution: text('resolution').notNull().default(''),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdAt: createdAt(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [
  index('reports_status_idx').on(t.status, t.createdAt),
  check('reports_target_type', sql`${t.targetType} IN ('user','venue','session','message')`),
  check('reports_status', sql`${t.status} IN ('open','resolved','dismissed')`),
]);

/* =====================  PHASE 5: teams & groups  ===================== */
export const teams = pgTable('teams', {
  id: id(),
  name: text('name').notNull(),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  cityId: uuid('city_id').notNull().references(() => cities.id),
  description: text('description').notNull().default(''),
  /** public: anyone may join instantly. request: join needs captain approval. invite_only: only via invite link. */
  joinMode: text('join_mode').notNull().default('request'),
  maxMembers: integer('max_members').notNull().default(20),
  inviteToken: text('invite_token').notNull().unique(),
  status: text('status').notNull().default('active'), // active | disbanded
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('teams_name_city_active').on(sql`lower(${t.name})`, t.cityId).where(sql`${t.status} = 'active'`),
  index('teams_browse_idx').on(t.status, t.sportId, t.cityId),
  check('teams_name_len', sql`char_length(${t.name}) BETWEEN 3 AND 40`),
  check('teams_max_members', sql`${t.maxMembers} BETWEEN 2 AND 50`),
  check('teams_join_mode', sql`${t.joinMode} IN ('public','request','invite_only')`),
  check('teams_status', sql`${t.status} IN ('active','disbanded')`),
]);

export const teamMembers = pgTable('team_members', {
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // captain | member
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.teamId, t.userId] }),
  index('team_members_user_idx').on(t.userId),
  // exactly one captain per team, enforced by the database
  uniqueIndex('team_one_captain').on(t.teamId).where(sql`${t.role} = 'captain'`),
  check('team_member_role', sql`${t.role} IN ('captain','member')`),
]);

export const teamRequests = pgTable('team_requests', {
  id: id(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull().default(''),
  status: text('status').notNull().default('pending'), // pending | approved | rejected | cancelled
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('team_request_one_pending').on(t.teamId, t.userId).where(sql`${t.status} = 'pending'`),
  check('team_request_status', sql`${t.status} IN ('pending','approved','rejected','cancelled')`),
]);

/** One invitation of a whole team to a session (anti-spam: unique per team+session). */
export const teamSessionInvites = pgTable('team_session_invites', {
  id: id(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => openSessions.id, { onDelete: 'cascade' }),
  invitedBy: uuid('invited_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('team_session_invite_once').on(t.teamId, t.sessionId)]);

/* =====================  PHASE 6: text chat (isolated module: src/server/messaging)  =====================
 * Membership is NOT copied here: it is derived from session_participants / team_members at read time,
 * so leaving a session or a team revokes chat access immediately. */
export const chatRooms = pgTable('chat_rooms', {
  id: id(),
  kind: text('kind').notNull(), // session | team
  sessionId: uuid('session_id').references(() => openSessions.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('chat_room_one_per_session').on(t.sessionId).where(sql`${t.sessionId} IS NOT NULL`),
  uniqueIndex('chat_room_one_per_team').on(t.teamId).where(sql`${t.teamId} IS NOT NULL`),
  check('chat_room_target', sql`(${t.kind} = 'session' AND ${t.sessionId} IS NOT NULL AND ${t.teamId} IS NULL) OR (${t.kind} = 'team' AND ${t.teamId} IS NOT NULL AND ${t.sessionId} IS NULL)`),
]);

/** `seq` is the polling cursor. Inserts into one room are serialised by a row lock on the room,
 * so within a room seq order == commit order and a cursor can never skip a message. */
export const chatMessages = pgTable('chat_messages', {
  seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  id: uuid('id').notNull().unique().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  body: text('body').notNull(),
  createdAt: createdAt(),
  hiddenAt: timestamp('hidden_at', { withTimezone: true }), // moderation: body is no longer shown
  hiddenBy: uuid('hidden_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => [
  index('chat_messages_room_seq_idx').on(t.roomId, t.seq),
  index('chat_messages_created_idx').on(t.createdAt), // retention sweep
  check('chat_message_body_len', sql`char_length(${t.body}) BETWEEN 1 AND 1000`),
]);

export const chatMembers = pgTable('chat_members', {
  roomId: uuid('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadSeq: bigint('last_read_seq', { mode: 'number' }).notNull().default(0),
  muted: boolean('muted').notNull().default(false),
}, (t) => [primaryKey({ columns: [t.roomId, t.userId] })]);

/** A user hides another user's messages inside one room (the blocked user is not told). */
export const chatBlocks = pgTable('chat_blocks', {
  roomId: uuid('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.roomId, t.blockerId, t.blockedId] }),
  check('chat_block_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
]);
