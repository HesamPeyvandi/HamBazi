CREATE TABLE "player_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"rater_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"scores" jsonb NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_reviews_not_self" CHECK ("player_reviews"."rater_id" <> "player_reviews"."target_id")
);
--> statement-breakpoint
CREATE TABLE "reliability_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"delta" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reliability_type" CHECK ("reliability_events"."type" IN ('attended','no_show','late_cancel'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "reports_target_type" CHECK ("reports"."target_type" IN ('user','venue','session')),
	CONSTRAINT "reports_status" CHECK ("reports"."status" IN ('open','resolved','dismissed'))
);
--> statement-breakpoint
CREATE TABLE "venue_reliability_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "attendance" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "attendance_marked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venue_reviews" ADD COLUMN "reservation_id" uuid;--> statement-breakpoint
ALTER TABLE "player_reviews" ADD CONSTRAINT "player_reviews_session_id_open_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."open_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_reviews" ADD CONSTRAINT "player_reviews_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_reviews" ADD CONSTRAINT "player_reviews_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_reviews" ADD CONSTRAINT "player_reviews_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reliability_events" ADD CONSTRAINT "reliability_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reliability_events" ADD CONSTRAINT "reliability_events_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_reliability_events" ADD CONSTRAINT "venue_reliability_events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_reliability_events" ADD CONSTRAINT "venue_reliability_events_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_reviews_unique" ON "player_reviews" USING btree ("session_id","rater_id","target_id");--> statement-breakpoint
CREATE INDEX "player_reviews_target_idx" ON "player_reviews" USING btree ("target_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reliability_one_per_game" ON "reliability_events" USING btree ("user_id","reservation_id","type");--> statement-breakpoint
CREATE INDEX "reliability_user_idx" ON "reliability_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_reliability_one" ON "venue_reliability_events" USING btree ("venue_id","reservation_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_reviews_one_per_game" ON "venue_reviews" USING btree ("reservation_id","user_id") WHERE "venue_reviews"."reservation_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "venue_reviews" ADD CONSTRAINT "venue_reviews_reservation_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;
