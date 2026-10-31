ALTER TABLE clinical_photo_attachments ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX clinical_photo_idempotency ON clinical_photo_attachments(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
