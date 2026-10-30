ALTER TABLE "chat_messages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "chat_messages_updated_idx" ON "chat_messages" USING btree ("room_id","updated_at") WHERE "chat_messages"."updated_at" IS NOT NULL;