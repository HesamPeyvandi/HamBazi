-- A venue (one physical hall) cannot have two overlapping time slots.
ALTER TABLE "time_slots"
  ADD CONSTRAINT "time_slots_no_overlap"
  EXCLUDE USING gist ("venue_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&);
--> statement-breakpoint
-- Audit log is append-only.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
