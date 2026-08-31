ALTER TABLE sessions ADD COLUMN completion_requirements_json TEXT;

CREATE TRIGGER IF NOT EXISTS trg_session_technical_values_writable
BEFORE INSERT ON session_technical_values
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
CREATE TRIGGER IF NOT EXISTS trg_session_power_writable
BEFORE INSERT ON session_power_records
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
CREATE TRIGGER IF NOT EXISTS trg_session_equipment_writable
BEFORE INSERT ON session_equipment_usage
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
CREATE TRIGGER IF NOT EXISTS trg_session_intercurrence_writable
BEFORE INSERT ON intercurrences
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
CREATE TRIGGER IF NOT EXISTS trg_session_photo_intent_writable
BEFORE INSERT ON clinical_photo_attachments
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
