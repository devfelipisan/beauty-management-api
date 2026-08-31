ALTER TABLE appointments ADD COLUMN settlement_source TEXT NOT NULL DEFAULT 'STANDARD' CHECK(settlement_source IN ('STANDARD','PACKAGE'));
