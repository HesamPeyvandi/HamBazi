CREATE TABLE "dev_sms_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"message" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "meta" jsonb;--> statement-breakpoint
CREATE INDEX "dev_sms_phone_idx" ON "dev_sms_outbox" USING btree ("phone_e164","created_at");