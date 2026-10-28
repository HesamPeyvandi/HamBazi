CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id"),
	CONSTRAINT "team_member_role" CHECK ("team_members"."role" IN ('captain','member'))
);
--> statement-breakpoint
CREATE TABLE "team_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "team_request_status" CHECK ("team_requests"."status" IN ('pending','approved','rejected','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "team_session_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sport_id" uuid NOT NULL,
	"city_id" uuid NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"join_mode" text DEFAULT 'request' NOT NULL,
	"max_members" integer DEFAULT 20 NOT NULL,
	"invite_token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "teams_name_len" CHECK (char_length("teams"."name") BETWEEN 3 AND 40),
	CONSTRAINT "teams_max_members" CHECK ("teams"."max_members" BETWEEN 2 AND 50),
	CONSTRAINT "teams_join_mode" CHECK ("teams"."join_mode" IN ('public','request','invite_only')),
	CONSTRAINT "teams_status" CHECK ("teams"."status" IN ('active','disbanded'))
);
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_requests" ADD CONSTRAINT "team_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_requests" ADD CONSTRAINT "team_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_session_invites" ADD CONSTRAINT "team_session_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_session_invites" ADD CONSTRAINT "team_session_invites_session_id_open_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."open_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_session_invites" ADD CONSTRAINT "team_session_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_one_captain" ON "team_members" USING btree ("team_id") WHERE "team_members"."role" = 'captain';--> statement-breakpoint
CREATE UNIQUE INDEX "team_request_one_pending" ON "team_requests" USING btree ("team_id","user_id") WHERE "team_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "team_session_invite_once" ON "team_session_invites" USING btree ("team_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_city_active" ON "teams" USING btree (lower("name"),"city_id") WHERE "teams"."status" = 'active';--> statement-breakpoint
CREATE INDEX "teams_browse_idx" ON "teams" USING btree ("status","sport_id","city_id");