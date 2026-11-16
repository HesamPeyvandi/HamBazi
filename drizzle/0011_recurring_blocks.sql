CREATE TABLE "recurring_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_blocks_weekday" CHECK ("recurring_blocks"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "recurring_blocks_minutes" CHECK ("recurring_blocks"."start_minute" >= 0 AND "recurring_blocks"."end_minute" <= 1440 AND "recurring_blocks"."end_minute" > "recurring_blocks"."start_minute"),
	CONSTRAINT "recurring_blocks_dates" CHECK ("recurring_blocks"."to_date" >= "recurring_blocks"."from_date")
);
--> statement-breakpoint
ALTER TABLE "time_slots" ADD COLUMN "block_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_blocks_venue_idx" ON "recurring_blocks" USING btree ("venue_id","active");--> statement-breakpoint
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_block_id_recurring_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."recurring_blocks"("id") ON DELETE set null ON UPDATE no action;