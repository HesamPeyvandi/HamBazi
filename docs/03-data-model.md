# ۰۳ — مدل داده (PostgreSQL)

اصول: زمان‌ها `timestamptz` (UTC)؛ پول `integer` تومان؛ شناسه `uuid` (v7)؛ حذف نرم برای کاربر/سالن؛ رکوردهای مالی و audit فقط افزودنی (append-only).

## هستهٔ هویت
- `users(id, phone_e164 UNIQUE, display_name, avatar_url, role: player|venue_manager|admin, status, created_at)`
- `user_profiles(user_id PK/FK, city_id, bio, birth_year?, gender?, preferred_sports[], privacy jsonb, notif_prefs jsonb, referral_code, referred_by)`
- `auth_challenges(id, phone_e164, code_hash, expires_at, attempts, used_at, ip_hash, created_at)` — idx `(phone_e164, created_at)`
- `user_sessions(id, user_id, token_hash UNIQUE, created_at, last_seen_at, expires_at, revoked_at, ip_hash, ua)`
- `rate_limits(key, window_start, count) PK(key, window_start)`

## جغرافیا و ورزش
- `cities(id, name_fa, slug, is_default)` ← سمنان پیش‌فرض
- `sports(id, key: futsal|volleyball, name_fa, default_capacity, skill_categories jsonb)` — توسعه‌پذیر به ورزش‌های دیگر

## سالن
- `venues(id, owner_user_id, city_id, name, description, address, lat, lng, status: draft|pending|published|suspended, rating_avg, rating_count, created_at)` — idx `(city_id, status)`
- `venue_managers(venue_id, user_id, role: owner|staff) PK(venue_id,user_id)`
- `venue_images(id, venue_id, storage_key, sort)`، `venue_facilities(venue_id, facility_key)`
- `venue_sports(venue_id, sport_id, price_per_slot int, slot_minutes, max_capacity)` — **ظرفیت فیزیکی سالن** اینجاست
- `time_slots(id, venue_id, sport_id, starts_at, ends_at, price int, status: open|closed|held|booked, version)` — UNIQUE `(venue_id, sport_id, starts_at)` و EXCLUDE همپوشانی برای هر سالن/ورزش

## رزرو
- `slot_claims(id, slot_id, reservation_id, status: held|confirmed|released, hold_expires_at)` — **UNIQUE جزئی** `(slot_id) WHERE status IN ('held','confirmed')` ⇒ دو ادعای فعال روی یک اسلات غیرممکن
- `reservations(id, host_user_id, venue_id, slot_id, mode: full|open_session, status, policy_version_id, fee_policy_snapshot jsonb, total_amount int, venue_payable int, created_at, version)`
- `reservation_participants(reservation_id, user_id, status, share_amount)`

## سانس باز
- `open_sessions(id, reservation_id UNIQUE, sport_id, target_count, min_to_confirm, skill_min, skill_max, price_per_participant int, join_deadline, payment_arrangement: single|split, visibility, description, invite_token UNIQUE, status, version)` 
- `session_participants(id, session_id, user_id, status: pending_payment|confirmed|left|removed|no_show|attended, joined_at, hold_expires_at)` — **UNIQUE `(session_id, user_id)`**
- فیلدهای جدا و صریح: `target_count` (هدف میزبان) ≠ `venue_sports.max_capacity` (ظرفیت فیزیکی) ≠ شمارش زندهٔ `confirmed` (حاضرین). قید: `target_count ≤ max_capacity`.

## پرداخت (همه با `mode: simulated|live` غیرقابل تغییر)
- `payment_intents(id, reservation_id, participant_id?, amount int, fee_amount int, venue_payable int, mode, status, provider, provider_ref, idempotency_key UNIQUE)`
- `payment_events(id, intent_id, from_status, to_status, payload jsonb, created_at)` — append-only (تریگر ضد UPDATE/DELETE)
- `refunds(id, intent_id, amount, mode, status, reason, UNIQUE(intent_id, reason))`
- `fee_policies(id, percent_bp, min_fixed, payer: player|venue, active_from)`
- `cancellation_policies(id, version, tiers jsonb, active_from)`
- `platform_settings(key PK, value jsonb)` — hold_minutes، deadline_hours و …، خوانده‌شده از `settings service`

## اعتماد و اعتبار (P3)
- `player_sport_profiles(user_id, sport_id, self_scores jsonb, peer_scores jsonb, ovr int, peer_count)`
- `player_reviews(id, session_id, rater_id, target_id, scores jsonb, comment)` — UNIQUE `(session_id, rater_id, target_id)`، CHECK `rater_id <> target_id`
- `reliability_events(id, user_id, session_id, type: attended|late_cancel|no_show|left_early, delta int, created_at)` — امتیاز از جمع رویدادها مشتق می‌شود (قابل بازمحاسبه)
- `venue_reviews(id, session_id, user_id, quality jsonb, comment)` UNIQUE `(session_id,user_id)`
- `venue_reliability_events(venue_id, type: cancelled_by_venue|…)`
- `reports(id, reporter_id, target_type, target_id, reason, status)`

## سایر
- `notifications(id, user_id, type, payload jsonb, read_at, created_at)` idx `(user_id, read_at, created_at)`
- `audit_logs(id, actor_id, action, entity, entity_id, diff jsonb, created_at)` — append-only
- `job_runs(name, run_at, status)`؛ `teams/memberships/invitations` (P5)؛ `conversations/participants/messages` (P6، ایزوله)

## قوانین حذف
کاربر/سالن: حذف نرم. رکوردهای مالی/audit: هرگز حذف نمی‌شوند؛ FK با `ON DELETE RESTRICT`. تصاویر: حذف فیزیکی با رکورد.

## قوانین امتیاز (مستند، قطعی)
- **مهارت (OVR):** `skill = (w_self · self + Σ peer) / (w_self + n_peer)` با `w_self = 3`؛ با رشد تعداد نظرات همتا وزن خودارزیابی کم می‌شود؛ نمایش به‌صورت «تخمین».
- **تعهد (Reliability):** پایه ۱۰۰؛ حضور +۱ (سقف ۱۰۰)، لغو دیرهنگام −۵، غیبت −۱۵، ترک زودهنگام −۵؛ حداقل ۰. درصد حضور = حاضر/ثبت‌نام‌شدهٔ قطعی. مبتدی بودن هرگز جریمه نمی‌شود (جدا از مهارت).


## افزوده‌های فاز ۵
- `teams(id, name, sport_id, city_id, description, join_mode public|request|invite_only, max_members 2..50, invite_token UNIQUE, status active|disbanded)` — یکتایی `lower(name)+city_id` فقط برای تیم‌های فعال.
- `team_members(team_id, user_id, role captain|member)` — کلید اصلی ترکیبی؛ ایندکس یکتای جزئی «فقط یک کاپیتان برای هر تیم».
- `team_requests(id, team_id, user_id, message, status pending|approved|rejected|cancelled)` — یک درخواست در انتظار برای هر (تیم، کاربر).
- `team_session_invites(team_id, session_id)` یکتا.
- قاعدهٔ سهم: `open_sessions.price_per_participant = ceil(slot.price / target_count / 1000) * 1000` (سرور)؛ `min_to_confirm = target_count`.


## افزوده‌های فاز ۶ (چت، ایزوله)
- `chat_rooms(id, kind session|team, session_id?, team_id?, last_message_at)` — CHECK «دقیقاً یکی از دو مرجع»؛ ایندکس یکتای جزئی برای هر سانس/تیم.
- `chat_messages(seq bigint identity PK, id uuid UNIQUE, room_id, sender_id, body 1..1000, created_at, hidden_at?, hidden_by?)` — ایندکس `(room_id, seq)` و `(created_at)` برای نگهداری.
- `chat_members(room_id, user_id, last_read_seq, muted)` — فقط وضعیت خواندن/بی‌صدا، **نه** عضویت.
- `chat_blocks(room_id, blocker_id, blocked_id)` — CHECK غیر خود.
- `reports.target_type` اکنون شامل `message`.
