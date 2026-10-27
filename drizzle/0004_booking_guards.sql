-- Payment events are append-only (financial audit trail).
CREATE TRIGGER payment_events_append_only BEFORE UPDATE OR DELETE ON "payment_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER refunds_no_delete BEFORE DELETE ON "refunds"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
-- A payment's mode (simulated vs live) and amounts can never be changed after creation.
CREATE OR REPLACE FUNCTION payment_intent_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.mode <> OLD.mode THEN RAISE EXCEPTION 'payment mode is immutable'; END IF;
  IF NEW.amount <> OLD.amount OR NEW.base_amount <> OLD.base_amount OR NEW.fee_amount <> OLD.fee_amount
     OR NEW.payer_user_id <> OLD.payer_user_id THEN RAISE EXCEPTION 'payment amounts are immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payment_intent_immutable_trg BEFORE UPDATE ON "payment_intents"
  FOR EACH ROW EXECUTE FUNCTION payment_intent_immutable();
--> statement-breakpoint
-- Default business policies (configuration, not demo data): 5% fee (min 5,000 toman) and the initial cancellation tiers.
INSERT INTO "fee_policies" ("percent_bp", "min_toman", "payer") VALUES (500, 5000, 'player');
--> statement-breakpoint
INSERT INTO "cancellation_policies" ("version", "tiers") VALUES
  (1, '[{"minHoursBefore":24,"refundPercent":100},{"minHoursBefore":0,"refundPercent":50}]'::jsonb);
