ALTER TABLE appointments ADD COLUMN deposit_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN customer_profile_at_calculation TEXT;
ALTER TABLE appointments ADD COLUMN discount_policy_id TEXT;
ALTER TABLE appointments ADD COLUMN discount_policy_snapshot_json TEXT;
ALTER TABLE appointments ADD COLUMN deposit_mode TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE appointments ADD COLUMN deposit_configured_value INTEGER;
