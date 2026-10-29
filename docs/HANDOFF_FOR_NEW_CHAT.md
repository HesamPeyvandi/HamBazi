# HamBazi (هم‌بازی) — Handoff for a new chat

You are taking over an in-progress project. Everything below is the state at the **end of Phase 6**. Read it fully before doing anything. The user will also give you the original brief (prompt), the 20 reference UI images, and `hambazi-phase5.zip` (the full code). **If anything here conflicts with the original brief, the brief wins — tell the user about the conflict.** (The previous chat lost access to the brief file partway through, so a few scope decisions in Phases 3–5 were inferred; see "Inferred decisions".)

---

## 0. How to work with this user (standing rules)

1. **Talk to the user in Persian** (all explanations, summaries, handoffs). Code, identifiers, commit messages and the project `README.md` are **English**; UI copy is Persian.
2. **Work in controlled phases (P0–P9).** After each phase, deliver a *complete handoff*: ZIP of the project, summary, file list, how to run locally, env vars, migrations, **real test results** (never claim untested things), known limitations, deployment steps, external services, acceptance checklist.
3. **Every phase-end chat message must contain the exact deployment procedure for BOTH:** (a) running locally and (b) GitHub + Neon + Vercel — spelled out in the chat message itself, not only in a docs file. The user has **not deployed anything yet** and said so explicitly.
4. **Wait for the user's approval before starting the next phase.** (A bare "Continue" from the user has been treated as approval.)
5. Dev/demo-only features (simulated payments, mock SMS) must be **refused in production** (server refuses to boot).
6. The user's earlier decisions: OTP-only login (no Google, no password); no domain yet; Neon DB reachable; Vercel reachable from Iran; real photos and fonts will be sent later (use placeholders/reference crops now, keep a list of what is needed in `docs/ASSETS.md`); the brand font must live in a separate, easily replaceable place (`src/styles/font.css`, `public/fonts/brand/`, `docs/FONT.md`); no watermark/labels needed on UI; write complete GitHub/Vercel/Neon steps.
7. Recent explicit requests: (a) deployment instructions at the end of every phase (done above); (b) `README.md` must be English and GitHub-friendly (done in Phase 5); (c) payment must support two modes — one person pays everything, or every player pays their own share — and the **system must compute each share automatically**, the user never types a price (done in Phase 5).
8. Be honest about what was and wasn't tested. Report bugs you find, including your own.

---

## 1. Product

Iranian sports-venue booking + player-matching platform for **futsal and volleyball** (default city **Semnan**). Persian RTL, Jalali dates (Asia/Tehran), Persian digits, money in **integer toman**, OTP-by-SMS login with a **mock** provider, **simulated** payments (dev/demo only), hosted on **Vercel** with **Neon Postgres**.

Roles: `player`, `venue_manager` (owner), `admin`.

---

## 2. Stack and conventions

- Next.js 16 (App Router, Server Actions, `instrumentation.ts` env validation), React 19, TypeScript strict, Tailwind 4.
- PostgreSQL 16 (btree_gist EXCLUDE, partial unique indexes, triggers), Drizzle ORM + drizzle-kit (SQL migrations in `drizzle/`), `postgres.js` with `prepare:false` (Neon/PgBouncer safe).
- Zod 4, `jalaali-js`, lucide-react, Vazirmatn font (self-hosted), `sharp`, `@vercel/blob`.
- Tests: Vitest on a **real Postgres** (`fileParallelism:false`), Playwright E2E scripts in `tests/e2e/phaseN.mjs`.
- **RTL rule:** logical CSS only. An ESLint rule bans `left/right/ml/mr/pl/pr` class names (it once caught an element id `pl-t`).
- **Persian digits** everywhere through the central i18n layer (`src/lib/i18n/*`); `formatToman` uses ASCII commas between Persian digits (existing behaviour).
- `APP_ENV` = `development | demo | production`; unknown/missing = production. Production **refuses** `SMS_PROVIDER=mock`, `PAYMENT_MODE=simulated` and placeholder secrets (secrets must be ≥32 chars).
- Authorization: owner/admin data is scoped at query level; another owner's resource answers **404**, not 403 (`requireRole` calls `notFound()`).
- Server-action error pattern: business failures throw `DomainError` (Persian message, stable `code`), the action redirects with `?err=...`; success redirects with `?ok=...`.
- A transaction that must *commit* a side effect (e.g. hold expiry) and then fail returns a result object and throws after commit.

---

## 3. Phase status

| Phase | Scope | Status |
|---|---|---|
| P0 | Architecture, data model, design system, docs (no code) | ✅ delivered |
| P1 | OTP login, RBAC, venue discovery, profile/onboarding, Semnan seed | ✅ delivered |
| P2 | Booking core: hold, double-booking guard, open sessions, simulated payments, fees, refunds, notifications, owner panel, admin venue approval | ✅ delivered |
| P3 | Trust: attendance, reliability score, peer ratings + OVR, venue reviews, reports | ✅ delivered |
| P4 | Owner dashboard (stats/chart), user settings (notification prefs, devices), admin panel (users, venue suspension, settings, versioned fee/cancellation policy, audit log) | ✅ delivered |
| P5 | Automatic split payment + two clear payment modes, **teams & groups** with matching, **English README** | ✅ delivered (zip: `hambazi-phase5.zip`) |
| P6 | Text chat rooms (session/team rooms; text only, no DMs, no calls/attachments) + real logo/photos | ✅ delivered (`docs/13-phase6-handoff.md`) |
| P7 | Real payment gateway (sandbox → live), behind the existing provider interface | ⏳ **NEXT** |
| P8 | PWA, performance, accessibility pass | ⏳ |
| P9 | Release hardening | ⏳ |

Zips delivered so far: `hambazi-phase0.zip … hambazi-phase5.zip`. **The user has not reported any deployment result yet.** Ask for it.

---

## 4. What exists (by area)

### Identity & auth (P1)
Phone normalization (Persian/Arabic digits, `0`/`+98`), OTP with HMAC-hashed codes, TTL 120 s, 5 attempts, 60 s resend cooldown, per-phone and per-IP hourly limits, DB sessions (rotated token, hashed), identical responses for existing/new numbers, safe redirects (allowlist of internal paths), mock SMS provider writes to `dev_sms_outbox` (dev/demo only). Onboarding with per-sport skill self-assessment.

### Venues (P1/P2)
Public list with filters/sort/pagination, venue detail (gallery, slots by day, reviews). Owner panel: create/edit venue, sports + prices, facilities, image upload (magic-byte validation, ≤4 MB, re-encoded to WebP ≤1600 px; Vercel Blob in prod, `.uploads/` + `/api/uploads/[...path]` locally and disabled in production), submit for review; admin approves/rejects. Slots are created in bulk only for **published** venues; an `EXCLUDE USING gist` constraint forbids overlapping slots per venue+sport.

### Booking & payments (P2, reworked in P5)
- **Hold:** 15 min (platform setting `hold_minutes`), enforced on the server; expiry is evaluated lazily and transactionally on every read/write of the slot; the daily cron (`/api/cron/sweep`, Bearer `CRON_SECRET`, `vercel.json` once a day because Vercel Hobby allows one) is only a backstop.
- **Double-booking guard:** slot row `FOR UPDATE` + partial unique index `slot_claims_one_active`. Lock order: slot row → session row → others.
- **Two payment modes** (booking page `/book/[slotId]?mode=full|split`):
  - **full** ("I pay everything"): one reservation, one payment = slot price + fee.
  - **split** ("split between players") = an **open session**: the host chooses only the **number of players**; `share = ceil(slotPrice / players / 1000) * 1000` computed **server-side** (`splitShare` in `src/server/booking/money.ts`); a client-sent price is ignored. Fee is charged per person on top. `open_sessions.min_to_confirm` is kept in the schema but is **always equal to `target_count`**: the session confirms only when every player has paid (otherwise the shares would not cover the venue). Rounding surplus (< 1,000 toman per person) stays with the venue and is shown to the user.
  - Host pays first and holds the slot; others can join only after the host is confirmed; joiners get a participant hold. If the deadline passes before the roster is full the session auto-cancels with 100 % (simulated) refunds. Invite token link for private sessions.
- **Fee:** `max(5000, ceil to 10 toman of 5 %)` from the versioned `fee_policies` table. **Cancellation:** versioned `cancellation_policies` tiers (≥24 h 100 %, ≥0 h 50 %, after start 0 %); venue/system cancellations always refund 100 %. Both are **snapshotted on each reservation**.
- **Payments:** provider-style simulated provider; intents are immutable (DB trigger), `payment_events` append-only, one refund per intent (unique), `simulatePay` idempotent. Every payment page says it is simulated.
- Notifications are persistent rows (`notifications`), bell counter in header; `notify()` honours per-user preference groups (critical types — payments/cancellations/refunds/no-show — can never be switched off).

### Trust (P3)
- **Attendance** marked by venue staff only, after the slot starts, within 14 days; corrections replace the previous event.
- **Reliability score** (derived from `reliability_events`, unique per user+reservation+type): start 100, attended +1 (cap 100), late_cancel −5, no_show −15, floor 0. A late cancel = player-initiated leave/cancel of a confirmed participation with refund < 100 %. Venue cancellations hit `venue_reliability_events`, not the player.
- **Skill:** per category `(3·self + Σpeer×10)/(3+n)`; OVR = rounded mean clamped 0..99; levels beginner <45, intermediate <75, pro.
- **Ratings:** only attended players can rate attended co-players (unique per session+rater+target) or review the venue (unique per reservation+user; recomputes venue `rating_avg/rating_count`).
- **Reports:** fixed reasons, ≤5 per 24 h, duplicate open report blocked; admin resolves/dismisses with optional user suspension (sessions revoked), reporter notified, audit logged.
- Public player profile respects privacy switches and never shows the phone number.

### Owner/admin (P4)
- Owner dashboard `/owner`: revenue (= `venue_payable` of confirmed/completed reservations, not the fee), bookings, occupancy, weighted rating, 7/30/90-day server-rendered bar chart, recent reservations, venue filter.
- `/settings`: notification groups (sessions, rating, teams, owner), privacy summary, logged-in devices (revoke one / all others).
- `/admin`: overview; `/admin/users` (search/filter/paginate, suspend/reactivate — revokes sessions, admins and self can't be suspended); `/admin/venues` (approve/reject + suspend/reinstate published venues); `/admin/reports`; `/admin/settings` (hold minutes, default join deadline, **new fee policy row**, **new cancellation policy version** with validation: last tier must be 0 h, non-increasing refund, no duplicates); `/admin/audit` (append-only log viewer with action-prefix filter).

### Teams & matching (P5)
- Tables: `teams`, `team_members`, `team_requests`, `team_session_invites` (migration `0006`). Team name unique per city (case-insensitive, active teams); exactly one captain per team (partial unique index); max 5 teams per user; capacity 2–50; join modes `public | request | invite_only`; invite token visible only to the captain and rotatable.
- Captain tools: approve/reject requests, remove member, transfer captaincy, regenerate invite link, edit, disband. Captain cannot leave (must transfer or disband).
- Matching: `suggestPlayers` = same city + sport, public profile, not a member, closest OVR to the team average first (reliability breaks ties). `invitePlayer` just sends a notification (once per player per 7 days).
- `inviteTeamToSession`: a team member who **hosts** a same-sport session notifies the other members once per (team, session).
- Pages: `/teams`, `/teams/new`, `/teams/[id]`, `/teams/join/[token]`.

### Chat (P6, isolated module `src/server/messaging`)
Rooms per session/team created lazily by a member; membership derived at read time (leaving revokes at once); non-members get 404; text only 1..1000 chars, control/bidi chars stripped, escaped at render; rate limit 6/10 s + 60/10 min (poll 120/min); cursor `seq` with per-room row lock so polling never skips; unread via `chat_members.last_read_seq`; ≤1 unread notification per (user, room); mute, per-room block, message reports (type `message`, text snapshot, admin hide + suspend); 90-day retention in the daily sweeper. Client polls every 3 s (backs off to 15 s, paused when the tab is hidden). Migration `0007`.

### Docs & README
`README.md` (English, GitHub-style, with screenshots in `docs/screenshots/`). `docs/` is **Persian**: 00 index (English), 01 reference inventory, 02 architecture, 03 data model, 04 state machines, 05 design system, 06 phase plan, 07/09/10/11/12 phase handoffs, **08 deployment guide (GitHub→Neon→Vercel)**, `FONT.md`, `ASSETS.md`, plus `iran-reachability-test/`.

---

## 5. Data / migrations

Drizzle migrations `0000`–`0006` in `drizzle/` (0001 slot overlap EXCLUDE + audit append-only trigger; 0003/0004 booking core and guards; 0005 trust; 0006 teams). `npm run db:migrate` applies them; for Neon use the **direct** (non-pooled) URL for migrations and the **pooled** URL for the app. `npm run db:seed` (dev/demo only) creates Semnan venues, 10 days of slots and sample users: `09000000001` player, `09000000002` venue manager, `09000000003` admin, `0900000001x` more players.

Env vars: `APP_ENV, DATABASE_URL, OTP_HMAC_SECRET, SESSION_SECRET, CRON_SECRET, APP_URL, SMS_PROVIDER, SMS_API_KEY, SMS_SENDER, PAYMENT_MODE, BLOB_READ_WRITE_TOKEN` (see `.env.example`). No new variable since Phase 2.

---

## 6. Test status at end of Phase 5 (all real runs)

- Vitest: **172 / 172** (11 files; needs Postgres + a migrated `hambazi_test` database, or `DATABASE_URL_TEST`).
- E2E (Playwright against the production build): phase1 **72/72**, phase2 **62/62**, phase3 **47/47**, phase4 **66/66**, phase5 **39/39**, phase6 **28/28** (chat; E2E uses a team room).
- `eslint` clean, `tsc --noEmit` clean, `next build` OK, production-start refusal with mock/simulated verified.
- Known `npm audit` items: esbuild inside drizzle-kit (dev tool) and zod nested in `@vercel/cli-config` (CLI only).

### Test-environment gotchas
- Sandbox Postgres runs on **port 5433** (`postgres://postgres@localhost:5433/hambazi`, test DB `hambazi_test`); it stops after environment resets — restart with `pg_ctl -D /var/pgdata -o '-p 5433' start` (as user `postgres`). After adding a migration, run it on **both** databases (`DATABASE_URL=...hambazi_test npm run db:migrate`).
- E2E scripts need `E2E_DB_URL` and a running production server (`npm run build && npm run start`). They share seeded users, so reseed (`npm run db:seed`) between suites; OTP has a 60 s per-phone cooldown, so reuse `storageState` instead of logging in twice, and leave a few seconds between suites.
- In E2E use `p[role=alert]` (Next's route announcer also has `role=alert`); after mutating clicks wait for a visible result rather than `waitForURL` when the URL already matches. Don't `pkill -f` a pattern that appears in your own command line.
- Real bugs found by E2E in the past: fractional team-average OVR in a SQL param (fixed + unit test), overflow on mobile owner page (fixed).

---

## 7. Inferred decisions (verify against the brief!)

1. The brief's page codes for Phase 3 (B17, B18, C12, C13) were ambiguous; I mapped them to: `/profile/commitment` (B17), `/report` (B18), `/owner/reviews` (C12), plus attendance `/owner/attendance` (C9). Phase 4 scope (full owner dashboard C1, settings B21–22, admin D) was derived from the phase plan and reference images 3, 15, 20. Phase 5 teams scope (A7) came from reference image 19.
2. Split payment now confirms **only when the roster is full** (no "minimum to confirm"). If the brief wanted partial-fill confirmation, a different design is needed (e.g. dynamic share with refund of the difference).
3. Reference-image conflicts decided earlier: OTP only (no password/Google); chat = text only, no DMs/calls/attachments; default city Semnan (images show Tehran); only futsal + volleyball active; no "blog" menu item.
4. "Pay everything" is a plain full reservation — other players cannot join it.
5. From the admin UI only these are configurable: hold minutes, default join deadline, fee policy and cancellation policy. OTP settings remain code/DB-only.

---

## 8. Known limitations / backlog

- Chat has no attachments/DMs/typing indicators/edit-delete by sender (by design); polling is near-real-time; session chat is covered by integration tests but E2E uses a team room.
- No real payment gateway or real SMS provider (interfaces exist: `SmsProvider`, payment provider; adapters pending).
- No UI to create/promote admins or change roles; no account self-deletion.
- Team-vs-team challenges not implemented; disbanded teams are not restorable.
- Real logo, hero, hall/locker photos and avatars are integrated (AI-looking images: owner must confirm rights); brand font still pending (`docs/FONT.md`).
- README license is "proprietary — all rights reserved"; the user should choose before going public.
- The user has not yet deployed; real-world deployment feedback (Neon/Vercel quirks, Iran reachability) is still unknown.

---

## 9. Suggested first steps for the new chat

1. Read the brief; sections 3 and 7 list scope decisions. **Known brief gaps still open:** waiting list + replacement participants + favorites (brief P5), contact/help page (P4 A17, B24), session/reservation oversight and review moderation in admin (P4), staff access (C14) — confirm with the user whether to schedule them.
2. `npm ci`, start Postgres (port 5433), `npm run db:migrate` on both DBs, `npm run db:seed`, `npx vitest run`, then E2E suites.
3. Ask the user for deployment results (Neon/Vercel/Iran reachability), brand font and approval of Phase 6.
4. Plan **Phase 7 — real payment gateway** (provider not chosen yet: ask), then P8 PWA/hardening, P9 release.
