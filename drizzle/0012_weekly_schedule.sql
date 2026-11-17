CREATE TABLE "venue_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"open_minute" integer NOT NULL,
	"close_minute" integer NOT NULL,
	"slot_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_schedules_weekday" CHECK ("venue_schedules"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "venue_schedules_range" CHECK ("venue_schedules"."open_minute" >= 0 AND "venue_schedules"."close_minute" <= 1440 AND "venue_schedules"."close_minute" - "venue_schedules"."open_minute" >= "venue_schedules"."slot_minutes" AND "venue_schedules"."slot_minutes" BETWEEN 15 AND 480)
);
--> statement-breakpoint
ALTER TABLE "time_slots" ADD COLUMN "auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "schedule_set" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venue_schedules" ADD CONSTRAINT "venue_schedules_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_schedules" ADD CONSTRAINT "venue_schedules_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_schedules_unique" ON "venue_schedules" USING btree ("venue_id","sport_id","weekday");