CREATE TYPE "public"."claim_status" AS ENUM('held', 'confirmed', 'released');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('pending_payment', 'confirmed', 'left', 'removed', 'expired', 'no_show', 'attended');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('simulated', 'live');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'succeeded', 'failed', 'cancelled', 'refund_pending', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'awaiting_payment', 'confirmed', 'cancelled', 'completed', 'expired', 'refund_pending', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('collecting', 'confirmed', 'cancelled', 'completed', 'expired');--> statement-breakpoint
CREATE TABLE "cancellation_policies" (
	"version" integer PRIMARY KEY NOT NULL,
	"tiers" jsonb NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"percent_bp" integer NOT NULL,
	"min_toman" integer DEFAULT 0 NOT NULL,
	"payer" text DEFAULT 'player' NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_bp_range" CHECK ("fee_policies"."percent_bp" BETWEEN 0 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"host_user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"target_count" integer NOT NULL,
	"min_to_confirm" integer NOT NULL,
	"skill_min" integer DEFAULT 0 NOT NULL,
	"skill_max" integer DEFAULT 99 NOT NULL,
	"price_per_participant" integer NOT NULL,
	"join_deadline" timestamp with time zone NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"invite_token" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "session_status" DEFAULT 'collecting' NOT NULL,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "open_sessions_reservation_id_unique" UNIQUE("reservation_id"),
	CONSTRAINT "open_sessions_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "open_sessions_counts" CHECK ("open_sessions"."target_count" >= 2 AND "open_sessions"."min_to_confirm" >= 2 AND "open_sessions"."min_to_confirm" <= "open_sessions"."target_count"),
	CONSTRAINT "open_sessions_skill" CHECK ("open_sessions"."skill_min" >= 0 AND "open_sessions"."skill_max" <= 99 AND "open_sessions"."skill_min" <= "open_sessions"."skill_max")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_user_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"participant_id" uuid,
	"base_amount" integer NOT NULL,
	"fee_amount" integer NOT NULL,
	"amount" integer NOT NULL,
	"venue_payable" integer NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"idempotency_key" text NOT NULL,
	"fee_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_amounts" CHECK ("payment_intents"."amount" = "payment_intents"."base_amount" + "payment_intents"."fee_amount" AND "payment_intents"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"percent" integer NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"status" text DEFAULT 'succeeded' NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_intent_id_unique" UNIQUE("intent_id"),
	CONSTRAINT "refund_positive" CHECK ("refunds"."amount" >= 0 AND "refunds"."percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"payment_arrangement" text NOT NULL,
	"status" "reservation_status" DEFAULT 'awaiting_payment' NOT NULL,
	"policy_version" integer NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"fee_snapshot" jsonb NOT NULL,
	"base_amount" integer NOT NULL,
	"fee_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer NOT NULL,
	"venue_payable" integer NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "reservations_amounts" CHECK ("reservations"."base_amount" > 0 AND "reservations"."fee_amount" >= 0 AND "reservations"."total_amount" >= "reservations"."base_amount")
);
--> statement-breakpoint
CREATE TABLE "session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_host" boolean DEFAULT false NOT NULL,
	"status" "participant_status" DEFAULT 'pending_payment' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"amount" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"status" "claim_status" DEFAULT 'held' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_sessions" ADD CONSTRAINT "open_sessions_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_sessions" ADD CONSTRAINT "open_sessions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_sessions" ADD CONSTRAINT "open_sessions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_sessions" ADD CONSTRAINT "open_sessions_slot_id_time_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."time_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_sessions" ADD CONSTRAINT "open_sessions_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_participant_id_session_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."session_participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_slot_id_time_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."time_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_policy_version_cancellation_policies_version_fk" FOREIGN KEY ("policy_version") REFERENCES "public"."cancellation_policies"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_open_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."open_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_claims" ADD CONSTRAINT "slot_claims_slot_id_time_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."time_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_claims" ADD CONSTRAINT "slot_claims_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "open_sessions_browse_idx" ON "open_sessions" USING btree ("status","join_deadline");--> statement-breakpoint
CREATE INDEX "payment_events_intent_idx" ON "payment_events" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "payment_intents_res_idx" ON "payment_intents" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_one_active" ON "payment_intents" USING btree ("reservation_id","payer_user_id") WHERE "payment_intents"."status" IN ('created','succeeded');--> statement-breakpoint
CREATE INDEX "reservations_host_idx" ON "reservations" USING btree ("host_user_id","created_at");--> statement-breakpoint
CREATE INDEX "reservations_venue_idx" ON "reservations" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "reservations_slot_idx" ON "reservations" USING btree ("slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_participants_unique" ON "session_participants" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "session_participants_user_idx" ON "session_participants" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_claims_one_active" ON "slot_claims" USING btree ("slot_id") WHERE "slot_claims"."status" IN ('held','confirmed');