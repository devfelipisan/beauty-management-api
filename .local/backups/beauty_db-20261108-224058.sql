PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_operations_foundation.sql','2026-11-02 02:32:23');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0002_reliability_foundation.sql','2026-11-02 02:32:23');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(3,'0003_scheduling_foundation.sql','2026-11-02 02:32:24');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(4,'0004_appointment_admission_dependencies.sql','2026-11-02 02:32:24');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(5,'0005_commercial_policy_materialization.sql','2026-11-02 02:32:24');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(6,'0006_create_appointment_authoritative_snapshot.sql','2026-11-02 02:32:24');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(7,'0007_deposit_lifecycle.sql','2026-11-02 02:32:24');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(8,'0008_outbox_delivery_foundation.sql','2026-11-02 02:32:24');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(9,'0009_appointment_confirmation_presence.sql','2026-11-02 02:32:24');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(10,'0010_session_foundation.sql','2026-11-02 02:32:24');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(11,'0011_technical_form_session_parameters.sql','2026-11-02 02:32:25');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(12,'0012_equipment_usage_previous_session_comparison_variation_alerts.sql','2026-11-02 02:32:25');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(13,'0013_intercurrence_clinical_restrictions.sql','2026-11-02 02:32:25');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(14,'0014_session_photos_r2_storage.sql','2026-11-02 02:32:25');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(15,'0015_session_completion.sql','2026-11-02 02:32:25');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(16,'0016_customer_history_profile_return.sql','2026-11-02 02:32:25');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(17,'0017_packages_session_consumption.sql','2026-11-02 02:32:25');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(18,'0018_package_assignment_qualification.sql','2026-11-02 02:32:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(19,'0019_receivable_payment_ledger_foundation.sql','2026-11-02 02:32:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(20,'0020_refund_internal_credit_financial_reversal.sql','2026-11-02 02:32:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(21,'0021_appointment_change_financial_effects.sql','2026-11-02 02:32:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(22,'0022_cancellation_no_show_policy_materialization.sql','2026-11-02 02:32:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(23,'0023_financial_effect_execution_reconciliation.sql','2026-11-02 02:32:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(24,'0024_financial_entity_versions.sql','2026-11-02 02:32:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(25,'0025_payment_versions.sql','2026-11-02 02:32:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(26,'0026_identity_rbac.sql','2026-11-02 02:32:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(27,'0027_media_capacity.sql','2026-11-02 02:32:27');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(28,'0028_clinical_upload_correlation.sql','2026-11-02 02:32:27');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(29,'0029_profile_images.sql','2026-11-02 02:32:27');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(30,'0030_profile_image_limit.sql','2026-11-02 02:32:27');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(31,'0031_agenda_read_permission.sql','2026-11-09 01:32:40');
CREATE TABLE tenants (id TEXT PRIMARY KEY, legal_name TEXT NOT NULL, display_name TEXT NOT NULL, document TEXT NOT NULL, timezone TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO "tenants" ("id","legal_name","display_name","document","timezone","status","created_at","updated_at") VALUES('tenant-dev-001','Clínica Aurora — ambiente sintético','Clínica Aurora — ambiente sintético','MOCK-TENANT-001','America/Sao_Paulo','ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "tenants" ("id","legal_name","display_name","document","timezone","status","created_at","updated_at") VALUES('tenant-other','Clínica Horizonte — isolamento sintético','Clínica Horizonte — isolamento sintético','MOCK-TENANT-OTHER','America/Sao_Paulo','ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
CREATE TABLE professionals (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, public_visible INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id));
INSERT INTO "professionals" ("id","tenant_id","name","status","public_visible","created_at","updated_at") VALUES('mock-professional-ana','tenant-dev-001','Ana Souza (sintético)','ACTIVE',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "professionals" ("id","tenant_id","name","status","public_visible","created_at","updated_at") VALUES('mock-professional-bruno','tenant-dev-001','Bruno Nascimento (sintético)','ACTIVE',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "professionals" ("id","tenant_id","name","status","public_visible","created_at","updated_at") VALUES('mock-professional-camila','tenant-dev-001','Camila Azevedo (sintético)','ACTIVE',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "professionals" ("id","tenant_id","name","status","public_visible","created_at","updated_at") VALUES('mock-professional-inativo','tenant-dev-001','Roberto Dias (sintético)','INACTIVE',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "professionals" ("id","tenant_id","name","status","public_visible","created_at","updated_at") VALUES('demo-professional-01','tenant-dev-001','Bianca Freitas (sintético)','ACTIVE',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "professionals" ("id","tenant_id","name","status","public_visible","created_at","updated_at") VALUES('demo-professional-02','tenant-dev-001','Eduardo Costa (sintético)','ACTIVE',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "professionals" ("id","tenant_id","name","status","public_visible","created_at","updated_at") VALUES('demo-professional-03','tenant-dev-001','Patrícia Moura (sintético)','ACTIVE',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "professionals" ("id","tenant_id","name","status","public_visible","created_at","updated_at") VALUES('demo-professional-04','tenant-dev-001','Renata Alves (sintético)','ACTIVE',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
CREATE TABLE services (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, duration_minutes INTEGER NOT NULL, base_price_cents INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, requires_assessment INTEGER NOT NULL DEFAULT 0, allows_discount INTEGER NOT NULL DEFAULT 0, minimum_price_cents INTEGER, deposit_mode TEXT NOT NULL DEFAULT 'NOT_REQUIRED', deposit_fixed_cents INTEGER, deposit_percentage_basis_points INTEGER, requires_equipment INTEGER NOT NULL DEFAULT 0, requires_photography INTEGER NOT NULL DEFAULT 0, has_technical_form INTEGER NOT NULL DEFAULT 0, technical_requirements_json TEXT, FOREIGN KEY (tenant_id) REFERENCES tenants(id));
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('mock-service-consulta','tenant-dev-001','Consulta estética de acompanhamento','GENERAL',60,20000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('mock-service-avaliacao','tenant-dev-001','Atendimento com avaliação obrigatória','GENERAL',30,10000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',1,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('mock-service-procedimento','tenant-dev-001','Procedimento demonstrativo com ficha e equipamento','GENERAL',60,30000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',1,0,NULL,'NOT_REQUIRED',NULL,NULL,1,0,1,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('mock-service-sinal','tenant-dev-001','Atendimento com sinal percentual de demonstração','GENERAL',45,25000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'PERCENTAGE',NULL,2000,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('mock-service-desconto','tenant-dev-001','Atendimento com benefício de demonstração','GENERAL',60,20000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,1,18000,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('mock-service-inativo','tenant-dev-001','Serviço desativado de demonstração','GENERAL',30,10000,'INACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('mock-service-outro-tenant','tenant-other','Serviço de isolamento sintético','GENERAL',30,10000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('demo-service-01','tenant-dev-001','Limpeza de pele demonstrativa','GENERAL',60,16000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('demo-service-02','tenant-dev-001','Hidratação facial demonstrativa','GENERAL',45,13000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('demo-service-03','tenant-dev-001','Massagem relaxante demonstrativa','GENERAL',60,18000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('demo-service-04','tenant-dev-001','Manicure demonstrativa','GENERAL',45,7000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('demo-service-05','tenant-dev-001','Pedicure demonstrativa','GENERAL',45,7500,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('demo-service-06','tenant-dev-001','Design de sobrancelhas demonstrativo','GENERAL',30,6500,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('demo-service-07','tenant-dev-001','Cuidados corporais demonstrativos','GENERAL',60,22000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
INSERT INTO "services" ("id","tenant_id","name","category","duration_minutes","base_price_cents","status","created_at","updated_at","requires_assessment","allows_discount","minimum_price_cents","deposit_mode","deposit_fixed_cents","deposit_percentage_basis_points","requires_equipment","requires_photography","has_technical_form","technical_requirements_json") VALUES('demo-service-08','tenant-dev-001','Consulta de retorno demonstrativa','GENERAL',30,9000,'ACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0,0,NULL,'NOT_REQUIRED',NULL,NULL,0,0,0,NULL);
CREATE TABLE customers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, full_name TEXT NOT NULL, phone TEXT, email TEXT, document TEXT, status TEXT NOT NULL, relationship_profile TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, blocked_for_new_appointments INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (tenant_id) REFERENCES tenants(id));
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-maria','tenant-dev-001','Maria Clara Almeida (sintético)',NULL,'maria@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-joao','tenant-dev-001','João Pedro Santos (sintético)',NULL,'joao@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-luisa','tenant-dev-001','Luísa D''Ávila (sintético)',NULL,'luisa@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-ana','tenant-dev-001','Ana Beatriz Lima (sintético)',NULL,'ana@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-bruna','tenant-dev-001','Bruna Carvalho (sintético)',NULL,'bruna@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-rafael','tenant-dev-001','Rafael Oliveira (sintético)',NULL,'rafael@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-perfil-inativo','tenant-dev-001','Helena Costa (sintético)',NULL,'perfil-inativo@example.test',NULL,'ACTIVE','INACTIVE','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-faltas','tenant-dev-001','Marcos Pereira (sintético)',NULL,'faltas@example.test',NULL,'ACTIVE','RECURRING_ABSENCES','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-bloqueado','tenant-dev-001','Paula Ribeiro (sintético)',NULL,'bloqueado@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',1);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-inativo','tenant-dev-001','Ricardo Mendes (sintético)',NULL,'inativo@example.test',NULL,'INACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-avaliacao-vencida','tenant-dev-001','Fernanda Martins (sintético)',NULL,'avaliacao-vencida@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-nao-apto','tenant-dev-001','Carlos Eduardo Rocha (sintético)',NULL,'nao-apto@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-sem-avaliacao','tenant-dev-001','Juliana Ferreira (sintético)',NULL,'sem-avaliacao@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('mock-customer-outro-tenant','tenant-other','Cliente de isolamento (sintético)',NULL,NULL,NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-001','tenant-dev-001','Alice Andrade (sintético)',NULL,'demo.cliente.001@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-002','tenant-dev-001','Beatriz Andrade (sintético)',NULL,'demo.cliente.002@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-003','tenant-dev-001','Carolina Andrade (sintético)',NULL,'demo.cliente.003@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-004','tenant-dev-001','Daniela Andrade (sintético)',NULL,'demo.cliente.004@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-005','tenant-dev-001','Elisa Andrade (sintético)',NULL,'demo.cliente.005@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-006','tenant-dev-001','Fabiana Andrade (sintético)',NULL,'demo.cliente.006@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-007','tenant-dev-001','Gabriela Andrade (sintético)',NULL,'demo.cliente.007@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-008','tenant-dev-001','Isabela Andrade (sintético)',NULL,'demo.cliente.008@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-009','tenant-dev-001','Júlia Andrade (sintético)',NULL,'demo.cliente.009@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-010','tenant-dev-001','Larissa Andrade (sintético)',NULL,'demo.cliente.010@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-011','tenant-dev-001','Marina Andrade (sintético)',NULL,'demo.cliente.011@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-012','tenant-dev-001','Natália Andrade (sintético)',NULL,'demo.cliente.012@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-013','tenant-dev-001','Alice Barbosa (sintético)',NULL,'demo.cliente.013@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-014','tenant-dev-001','Beatriz Barbosa (sintético)',NULL,'demo.cliente.014@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-015','tenant-dev-001','Carolina Barbosa (sintético)',NULL,'demo.cliente.015@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-016','tenant-dev-001','Daniela Barbosa (sintético)',NULL,'demo.cliente.016@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-017','tenant-dev-001','Elisa Barbosa (sintético)',NULL,'demo.cliente.017@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-018','tenant-dev-001','Fabiana Barbosa (sintético)',NULL,'demo.cliente.018@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-019','tenant-dev-001','Gabriela Barbosa (sintético)',NULL,'demo.cliente.019@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-020','tenant-dev-001','Isabela Barbosa (sintético)',NULL,'demo.cliente.020@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-021','tenant-dev-001','Júlia Barbosa (sintético)',NULL,'demo.cliente.021@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-022','tenant-dev-001','Larissa Barbosa (sintético)',NULL,'demo.cliente.022@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-023','tenant-dev-001','Marina Barbosa (sintético)',NULL,'demo.cliente.023@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-024','tenant-dev-001','Natália Barbosa (sintético)',NULL,'demo.cliente.024@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-025','tenant-dev-001','Alice Castro (sintético)',NULL,'demo.cliente.025@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-026','tenant-dev-001','Beatriz Castro (sintético)',NULL,'demo.cliente.026@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-027','tenant-dev-001','Carolina Castro (sintético)',NULL,'demo.cliente.027@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-028','tenant-dev-001','Daniela Castro (sintético)',NULL,'demo.cliente.028@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-029','tenant-dev-001','Elisa Castro (sintético)',NULL,'demo.cliente.029@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-030','tenant-dev-001','Fabiana Castro (sintético)',NULL,'demo.cliente.030@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-031','tenant-dev-001','Gabriela Castro (sintético)',NULL,'demo.cliente.031@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-032','tenant-dev-001','Isabela Castro (sintético)',NULL,'demo.cliente.032@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-033','tenant-dev-001','Júlia Castro (sintético)',NULL,'demo.cliente.033@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-034','tenant-dev-001','Larissa Castro (sintético)',NULL,'demo.cliente.034@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-035','tenant-dev-001','Marina Castro (sintético)',NULL,'demo.cliente.035@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-036','tenant-dev-001','Natália Castro (sintético)',NULL,'demo.cliente.036@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-037','tenant-dev-001','Alice Duarte (sintético)',NULL,'demo.cliente.037@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-038','tenant-dev-001','Beatriz Duarte (sintético)',NULL,'demo.cliente.038@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-039','tenant-dev-001','Carolina Duarte (sintético)',NULL,'demo.cliente.039@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-040','tenant-dev-001','Daniela Duarte (sintético)',NULL,'demo.cliente.040@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-041','tenant-dev-001','Elisa Duarte (sintético)',NULL,'demo.cliente.041@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-042','tenant-dev-001','Fabiana Duarte (sintético)',NULL,'demo.cliente.042@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-043','tenant-dev-001','Gabriela Duarte (sintético)',NULL,'demo.cliente.043@example.test',NULL,'ACTIVE','LOYAL','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-044','tenant-dev-001','Isabela Duarte (sintético)',NULL,'demo.cliente.044@example.test',NULL,'ACTIVE','OLD','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-045','tenant-dev-001','Júlia Duarte (sintético)',NULL,'demo.cliente.045@example.test',NULL,'ACTIVE','NEW','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
INSERT INTO "customers" ("id","tenant_id","full_name","phone","email","document","status","relationship_profile","created_at","updated_at","blocked_for_new_appointments") VALUES('demo-customer-046','tenant-dev-001','Larissa Duarte (sintético)',NULL,'demo.cliente.046@example.test',NULL,'ACTIVE','REGULAR','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z',0);
CREATE TABLE professional_services (tenant_id TEXT NOT NULL, professional_id TEXT NOT NULL, service_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, professional_id, service_id), FOREIGN KEY (tenant_id) REFERENCES tenants(id));
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-ana','mock-service-consulta','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-ana','mock-service-avaliacao','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-ana','mock-service-procedimento','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-ana','mock-service-sinal','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-ana','mock-service-desconto','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-ana','mock-service-inativo','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-bruno','mock-service-consulta','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-bruno','mock-service-sinal','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-bruno','mock-service-desconto','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-camila','mock-service-consulta','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','mock-professional-inativo','mock-service-consulta','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-01','demo-service-01','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-01','demo-service-02','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-01','demo-service-03','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-01','demo-service-04','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-01','demo-service-05','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-01','demo-service-06','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-01','demo-service-07','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-01','demo-service-08','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-01','mock-service-consulta','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-02','demo-service-01','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-02','demo-service-02','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-02','demo-service-03','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-02','demo-service-04','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-02','demo-service-05','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-02','demo-service-06','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-02','demo-service-07','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-02','demo-service-08','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-02','mock-service-consulta','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-03','demo-service-01','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-03','demo-service-02','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-03','demo-service-03','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-03','demo-service-04','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-03','demo-service-05','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-03','demo-service-06','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-03','demo-service-07','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-03','demo-service-08','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-03','mock-service-consulta','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-04','demo-service-01','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-04','demo-service-02','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-04','demo-service-03','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-04','demo-service-04','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-04','demo-service-05','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-04','demo-service-06','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-04','demo-service-07','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-04','demo-service-08','2026-11-02T00:00:00.000Z');
INSERT INTO "professional_services" ("tenant_id","professional_id","service_id","created_at") VALUES('tenant-dev-001','demo-professional-04','mock-service-consulta','2026-11-02T00:00:00.000Z');
CREATE TABLE idempotency_records (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL, response_payload TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT);
CREATE TABLE audit_events (id TEXT PRIMARY KEY, tenant_id TEXT, actor_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT, request_id TEXT NOT NULL, correlation_id TEXT NOT NULL, metadata_json TEXT, occurred_at TEXT NOT NULL);
CREATE TABLE outbox_events (id TEXT PRIMARY KEY, tenant_id TEXT, event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, correlation_id TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, published_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z', claimed_at TEXT, claim_expires_at TEXT, claimed_by TEXT, sent_at TEXT, last_error_code TEXT, last_error_at TEXT);
CREATE TABLE appointments (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, service_id TEXT NOT NULL, professional_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, duration_minutes INTEGER NOT NULL, base_price_cents INTEGER, discount_cents INTEGER, final_price_cents INTEGER, deposit_cents INTEGER, origin TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deposit_required INTEGER NOT NULL DEFAULT 0, customer_profile_at_calculation TEXT, discount_policy_id TEXT, discount_policy_snapshot_json TEXT, deposit_mode TEXT NOT NULL DEFAULT 'NOT_REQUIRED', deposit_configured_value INTEGER, confirmed_at TEXT, confirmed_by TEXT, checked_in_at TEXT, checked_in_by TEXT, customer_package_id TEXT, settlement_source TEXT NOT NULL DEFAULT 'STANDARD' CHECK(settlement_source IN ('STANDARD','PACKAGE')), cancellation_origin TEXT, cancellation_reason TEXT, cancellation_note TEXT, canceled_at TEXT, canceled_by TEXT, FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (customer_id) REFERENCES customers(id), FOREIGN KEY (service_id) REFERENCES services(id), FOREIGN KEY (professional_id) REFERENCES professionals(id));
CREATE TABLE licenses (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, plan_id TEXT NOT NULL, subscription_reference TEXT, starts_at TEXT NOT NULL, expires_at TEXT, tolerance_until TEXT, status TEXT NOT NULL, limits_json TEXT NOT NULL, enabled_resources_json TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id));
INSERT INTO "licenses" ("id","tenant_id","plan_id","subscription_reference","starts_at","expires_at","tolerance_until","status","limits_json","enabled_resources_json") VALUES('mock-license-tenant-dev-001','tenant-dev-001','plan-appointment',NULL,'2026-10-03T00:00:00.000Z','2027-11-02T00:00:00.000Z',NULL,'ACTIVE','{}','["APPOINTMENT_ADMISSION"]');
INSERT INTO "licenses" ("id","tenant_id","plan_id","subscription_reference","starts_at","expires_at","tolerance_until","status","limits_json","enabled_resources_json") VALUES('mock-license-tenant-other','tenant-other','plan-appointment',NULL,'2026-10-03T00:00:00.000Z','2027-11-02T00:00:00.000Z',NULL,'ACTIVE','{}','["APPOINTMENT_ADMISSION"]');
CREATE TABLE assessments (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, service_id TEXT NOT NULL, professional_id TEXT NOT NULL, result TEXT NOT NULL, performed_at TEXT NOT NULL, valid_until TEXT, created_at TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id));
INSERT INTO "assessments" ("id","tenant_id","customer_id","service_id","professional_id","result","performed_at","valid_until","created_at") VALUES('mock-assessment-maria-avaliacao','tenant-dev-001','mock-customer-maria','mock-service-avaliacao','mock-professional-ana','APTO','2026-10-26T00:00:00.000Z','2026-12-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "assessments" ("id","tenant_id","customer_id","service_id","professional_id","result","performed_at","valid_until","created_at") VALUES('mock-assessment-maria-procedimento','tenant-dev-001','mock-customer-maria','mock-service-procedimento','mock-professional-ana','APTO','2026-10-26T00:00:00.000Z','2026-12-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "assessments" ("id","tenant_id","customer_id","service_id","professional_id","result","performed_at","valid_until","created_at") VALUES('mock-assessment-avaliacao-vencida-avaliacao','tenant-dev-001','mock-customer-avaliacao-vencida','mock-service-avaliacao','mock-professional-ana','APTO','2026-09-03T00:00:00.000Z','2026-11-01T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "assessments" ("id","tenant_id","customer_id","service_id","professional_id","result","performed_at","valid_until","created_at") VALUES('mock-assessment-avaliacao-vencida-procedimento','tenant-dev-001','mock-customer-avaliacao-vencida','mock-service-procedimento','mock-professional-ana','APTO','2026-09-03T00:00:00.000Z','2026-11-01T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "assessments" ("id","tenant_id","customer_id","service_id","professional_id","result","performed_at","valid_until","created_at") VALUES('mock-assessment-nao-apto-avaliacao','tenant-dev-001','mock-customer-nao-apto','mock-service-avaliacao','mock-professional-ana','NAO_APTO','2026-10-26T00:00:00.000Z','2026-12-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "assessments" ("id","tenant_id","customer_id","service_id","professional_id","result","performed_at","valid_until","created_at") VALUES('mock-assessment-nao-apto-procedimento','tenant-dev-001','mock-customer-nao-apto','mock-service-procedimento','mock-professional-ana','NAO_APTO','2026-10-26T00:00:00.000Z','2026-12-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
CREATE TABLE discount_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_profile TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value INTEGER NOT NULL,
  eligible_services_json TEXT,
  eligible_categories_json TEXT,
  minimum_purchase_cents INTEGER,
  maximum_discount_cents INTEGER,
  valid_from TEXT,
  valid_until TEXT,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  single_use INTEGER NOT NULL DEFAULT 0,
  stackable INTEGER NOT NULL DEFAULT 0,
  priority INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
INSERT INTO "discount_policies" ("id","tenant_id","customer_profile","discount_type","discount_value","eligible_services_json","eligible_categories_json","minimum_purchase_cents","maximum_discount_cents","valid_from","valid_until","requires_approval","single_use","stackable","priority","created_at","updated_at") VALUES('mock-discount-loyal','tenant-dev-001','LOYAL','PERCENTAGE',1000,'["mock-service-desconto"]',NULL,NULL,NULL,'2026-10-03T00:00:00.000Z','2027-11-02T00:00:00.000Z',0,0,0,1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
CREATE TABLE deposits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  confirmed_at TEXT,
  canceled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  started_by TEXT NOT NULL,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, completion_requirements_json TEXT, customer_package_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE (tenant_id, appointment_id)
);
CREATE TABLE technical_forms (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, service_id TEXT NOT NULL,
  version INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), UNIQUE (tenant_id, service_id, version)
);
INSERT INTO "technical_forms" ("id","tenant_id","service_id","version","status","created_at","created_by") VALUES('mock-form-procedimento','tenant-dev-001','mock-service-procedimento',1,'ACTIVE','2026-11-02T00:00:00.000Z','actor-dev-admin');
CREATE TABLE technical_form_fields (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, form_id TEXT NOT NULL, field_key TEXT NOT NULL,
  name TEXT NOT NULL, description TEXT, field_type TEXT NOT NULL, field_order INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 0, minimum TEXT, maximum TEXT, precision INTEGER,
  unit TEXT, options_json TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE',
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (form_id) REFERENCES technical_forms(id),
  UNIQUE (tenant_id, form_id, field_key)
);
INSERT INTO "technical_form_fields" ("id","tenant_id","form_id","field_key","name","description","field_type","field_order","required","minimum","maximum","precision","unit","options_json","status") VALUES('mock-field-observacao','tenant-dev-001','mock-form-procedimento','observacao','Observação da simulação',NULL,'SHORT_TEXT',1,1,NULL,NULL,NULL,NULL,NULL,'ACTIVE');
INSERT INTO "technical_form_fields" ("id","tenant_id","form_id","field_key","name","description","field_type","field_order","required","minimum","maximum","precision","unit","options_json","status") VALUES('mock-field-conforto','tenant-dev-001','mock-form-procedimento','conforto','Conforto informado na simulação',NULL,'INTEGER',2,0,'0','10',NULL,NULL,NULL,'ACTIVE');
CREATE TABLE session_technical_form_snapshots (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, service_id TEXT NOT NULL,
  form_id TEXT NOT NULL, form_version INTEGER NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (form_id) REFERENCES technical_forms(id),
  UNIQUE (tenant_id, session_id)
);
CREATE TABLE session_technical_field_snapshots (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, field_key TEXT NOT NULL,
  name TEXT NOT NULL, description TEXT, field_type TEXT NOT NULL, field_order INTEGER NOT NULL,
  required INTEGER NOT NULL, minimum TEXT, maximum TEXT, precision INTEGER, unit TEXT, options_json TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (snapshot_id) REFERENCES session_technical_form_snapshots(id),
  UNIQUE (tenant_id, snapshot_id, field_key)
);
CREATE TABLE session_technical_values (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, field_snapshot_id TEXT NOT NULL,
  value_type TEXT NOT NULL, text_value TEXT, integer_value INTEGER, decimal_value TEXT, boolean_value INTEGER,
  date_value TEXT, time_value TEXT, json_value TEXT, unit TEXT, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (field_snapshot_id) REFERENCES session_technical_field_snapshots(id),
  UNIQUE (tenant_id, session_id, field_snapshot_id)
);
CREATE TABLE session_power_records (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, value TEXT NOT NULL, unit TEXT NOT NULL,
  recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE TABLE equipment (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, model TEXT, manufacturer TEXT,
  serial_number TEXT, main_unit TEXT, status TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
INSERT INTO "equipment" ("id","tenant_id","name","model","manufacturer","serial_number","main_unit","status","notes","created_at","updated_at") VALUES('mock-equipment-disponivel','tenant-dev-001','Equipamento demonstrativo A','MODELO-MOCK',NULL,'MOCK-disponivel',NULL,'AVAILABLE','Equipamento fictício. Não representa dispositivo ou protocolo clínico real.','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "equipment" ("id","tenant_id","name","model","manufacturer","serial_number","main_unit","status","notes","created_at","updated_at") VALUES('mock-equipment-manutencao','tenant-dev-001','Equipamento demonstrativo B','MODELO-MOCK',NULL,'MOCK-manutencao',NULL,'MAINTENANCE','Equipamento fictício. Não representa dispositivo ou protocolo clínico real.','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
CREATE TABLE equipment_service_compatibility (
  tenant_id TEXT NOT NULL, equipment_id TEXT NOT NULL, service_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, equipment_id, service_id), FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
INSERT INTO "equipment_service_compatibility" ("tenant_id","equipment_id","service_id","created_at") VALUES('tenant-dev-001','mock-equipment-disponivel','mock-service-procedimento','2026-11-02T00:00:00.000Z');
INSERT INTO "equipment_service_compatibility" ("tenant_id","equipment_id","service_id","created_at") VALUES('tenant-dev-001','mock-equipment-manutencao','mock-service-procedimento','2026-11-02T00:00:00.000Z');
CREATE TABLE session_equipment_usage (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, equipment_id TEXT NOT NULL,
  equipment_name_snapshot TEXT NOT NULL, equipment_model_snapshot TEXT, manufacturer_snapshot TEXT,
  serial_number_snapshot TEXT, main_unit_snapshot TEXT, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE TABLE variation_policies (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, service_id TEXT NOT NULL, parameter_key TEXT NOT NULL,
  mode TEXT NOT NULL, threshold TEXT NOT NULL, unit TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), UNIQUE (tenant_id, service_id, parameter_key, status)
);
CREATE TABLE session_variation_alerts (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, parameter_key TEXT NOT NULL,
  previous_session_id TEXT, previous_value TEXT, current_value TEXT NOT NULL, unit TEXT, policy_id TEXT NOT NULL,
  policy_snapshot_json TEXT NOT NULL, threshold TEXT NOT NULL, variation TEXT NOT NULL, status TEXT NOT NULL,
  justification TEXT, justified_at TEXT, justified_by TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE TABLE intercurrences (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, customer_id TEXT NOT NULL,
  service_id TEXT NOT NULL, professional_id TEXT NOT NULL, type_code TEXT NOT NULL, severity TEXT NOT NULL,
  description TEXT NOT NULL, conduct TEXT NOT NULL, equipment_usage_id TEXT, power_record_id TEXT,
  requires_follow_up INTEGER NOT NULL DEFAULT 0, requires_reassessment INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, occurred_at TEXT NOT NULL, reported_at TEXT NOT NULL, reported_by TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE TABLE clinical_restrictions (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, source_type TEXT NOT NULL,
  source_id TEXT NOT NULL, scope TEXT NOT NULL, blocks_new_appointments INTEGER NOT NULL DEFAULT 0,
  requires_reassessment INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, effective_from TEXT NOT NULL,
  resolved_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE (tenant_id, source_id)
);
CREATE TABLE customer_clinical_restrictions (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, restriction_id TEXT NOT NULL, customer_id TEXT NOT NULL,
  source_type TEXT NOT NULL, source_id TEXT NOT NULL, blocks_new_appointments INTEGER NOT NULL,
  requires_reassessment INTEGER NOT NULL, status TEXT NOT NULL, activated_at TEXT NOT NULL, resolved_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id), UNIQUE (tenant_id, restriction_id)
);
CREATE TABLE clinical_photo_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  intercurrence_id TEXT,
  purpose TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum TEXT,
  etag TEXT,
  status TEXT NOT NULL,
  captured_at TEXT,
  uploaded_at TEXT,
  uploaded_by TEXT NOT NULL,
  failure_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, idempotency_key TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (intercurrence_id) REFERENCES intercurrences(id)
);
CREATE TABLE customer_timeline_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source_worker TEXT NOT NULL,
  source_aggregate_type TEXT NOT NULL,
  source_aggregate_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  service_id TEXT,
  professional_id TEXT,
  status TEXT,
  summary_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, source_event_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE customer_relationship_stats (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  completed_sessions_count INTEGER NOT NULL DEFAULT 0,
  last_completed_session_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, customer_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE relationship_profile_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  previous_profile TEXT NOT NULL,
  new_profile TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  UNIQUE (tenant_id, source_event_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE return_recommendations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONVERTED')),
  recommended_at TEXT NOT NULL,
  recommended_for TEXT,
  interval_value INTEGER,
  interval_unit TEXT,
  reason_code TEXT,
  observation TEXT,
  appointment_id TEXT,
  created_at TEXT NOT NULL,
  converted_at TEXT,
  UNIQUE (tenant_id, session_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE package_definitions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, service_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
 base_price_cents INTEGER NOT NULL CHECK(base_price_cents >= 0), discount_cents INTEGER NOT NULL CHECK(discount_cents >= 0 AND discount_cents <= base_price_cents),
 final_price_cents INTEGER NOT NULL CHECK(final_price_cents >= 0), validity_days INTEGER, status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
CREATE TABLE customer_packages (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, package_definition_id TEXT, customer_id TEXT NOT NULL, service_id TEXT NOT NULL,
 total_quantity INTEGER NOT NULL CHECK(total_quantity > 0), remaining_quantity INTEGER NOT NULL CHECK(remaining_quantity >= 0 AND remaining_quantity <= total_quantity),
 base_price_cents INTEGER NOT NULL CHECK(base_price_cents >= 0), discount_cents INTEGER NOT NULL CHECK(discount_cents >= 0 AND discount_cents <= base_price_cents), final_price_cents INTEGER NOT NULL CHECK(final_price_cents >= 0),
 purchased_at TEXT NOT NULL, valid_until TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ACTIVE','COMPLETED','EXPIRED','CANCELED')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE TABLE package_movements (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_package_id TEXT NOT NULL, customer_id TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('INITIAL_CREDIT','CONSUMPTION')), quantity INTEGER NOT NULL CHECK(quantity > 0),
 balance_before INTEGER NOT NULL CHECK(balance_before >= 0), balance_after INTEGER NOT NULL CHECK(balance_after >= 0), session_id TEXT, appointment_id TEXT, source_event_id TEXT NOT NULL, occurred_at TEXT NOT NULL, created_by TEXT NOT NULL,
 UNIQUE(tenant_id,session_id,type), FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(customer_package_id) REFERENCES customer_packages(id)
);
CREATE TABLE receivables (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('APPOINTMENT','CUSTOMER_PACKAGE')),
  source_id TEXT NOT NULL, appointment_id TEXT, session_id TEXT, customer_package_id TEXT,
  gross_amount_cents INTEGER NOT NULL CHECK(gross_amount_cents >= 0),
  discount_amount_cents INTEGER NOT NULL CHECK(discount_amount_cents >= 0 AND discount_amount_cents <= gross_amount_cents),
  net_amount_cents INTEGER NOT NULL CHECK(net_amount_cents = gross_amount_cents - discount_amount_cents),
  deposit_applied_cents INTEGER NOT NULL DEFAULT 0 CHECK(deposit_applied_cents >= 0 AND deposit_applied_cents <= net_amount_cents),
  paid_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount_cents >= 0 AND paid_amount_cents <= net_amount_cents),
  outstanding_amount_cents INTEGER NOT NULL CHECK(outstanding_amount_cents >= 0 AND outstanding_amount_cents <= net_amount_cents),
  status TEXT NOT NULL CHECK(status IN ('OPEN','PARTIALLY_PAID','PAID')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(tenant_id, source_type, source_id), FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE TABLE payments (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, receivable_id TEXT NOT NULL, customer_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), method TEXT NOT NULL CHECK(method IN ('CASH','PIX','DEBIT_CARD','CREDIT_CARD','TRANSFER','INTERNAL_CREDIT')),
  status TEXT NOT NULL CHECK(status IN ('CONFIRMED')), received_at TEXT NOT NULL, received_by TEXT NOT NULL,
  external_reference TEXT, notes TEXT, created_at TEXT NOT NULL, refunded_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_amount_cents >= 0 AND refunded_amount_cents <= amount_cents), version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(receivable_id) REFERENCES receivables(id)
);
CREATE TABLE uow_assertions (id TEXT PRIMARY KEY, expected_changes INTEGER NOT NULL);
CREATE TABLE ledger_movements (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, receivable_id TEXT, type TEXT NOT NULL CHECK(type IN ('RECEIVABLE_CREATED','DEPOSIT_APPLIED','PAYMENT_RECEIVED','REFUND_ISSUED','CREDIT_GRANTED','CREDIT_APPLIED')), amount_cents INTEGER NOT NULL CHECK(amount_cents>0), direction TEXT NOT NULL CHECK(direction IN ('CREDIT','DEBIT')), source_type TEXT NOT NULL, source_id TEXT NOT NULL, occurred_at TEXT NOT NULL, created_by TEXT NOT NULL, correlation_id TEXT NOT NULL, UNIQUE(tenant_id,type,source_type,source_id,receivable_id), FOREIGN KEY(tenant_id) REFERENCES tenants(id));
CREATE TABLE refunds (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,payment_id TEXT NOT NULL,receivable_id TEXT NOT NULL,customer_id TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),reason_code TEXT,notes TEXT,status TEXT NOT NULL CHECK(status IN ('CONFIRMED')),refunded_at TEXT NOT NULL,refunded_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(payment_id) REFERENCES payments(id));
CREATE TABLE customer_credit_balances (tenant_id TEXT NOT NULL,customer_id TEXT NOT NULL,available_amount_cents INTEGER NOT NULL CHECK(available_amount_cents>=0),updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,customer_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id));
CREATE TABLE appointment_reschedule_history (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,appointment_id TEXT NOT NULL,previous_starts_at TEXT NOT NULL,previous_ends_at TEXT NOT NULL,previous_professional_id TEXT NOT NULL,new_starts_at TEXT NOT NULL,new_ends_at TEXT NOT NULL,new_professional_id TEXT NOT NULL,reason TEXT NOT NULL,changed_at TEXT NOT NULL,changed_by TEXT NOT NULL,source_request_id TEXT NOT NULL,UNIQUE(tenant_id,source_request_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id));
CREATE TABLE appointment_cancellation_history (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,appointment_id TEXT NOT NULL,reason TEXT NOT NULL,note TEXT,origin TEXT NOT NULL,changed_at TEXT NOT NULL,changed_by TEXT NOT NULL,source_request_id TEXT NOT NULL, financial_decision_json TEXT,UNIQUE(tenant_id,source_request_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id));
CREATE TABLE cancellation_policies (
  id TEXT NOT NULL, tenant_id TEXT NOT NULL, version INTEGER NOT NULL,
  service_id TEXT, status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')),
  effective_from TEXT NOT NULL, effective_until TEXT,
  customer_deposit_disposition TEXT NOT NULL CHECK(customer_deposit_disposition IN ('NONE','RETURN','RETAIN','CONVERT_TO_CREDIT','TRANSFER')),
  company_deposit_disposition TEXT NOT NULL CHECK(company_deposit_disposition IN ('NONE','RETURN','RETAIN','CONVERT_TO_CREDIT','TRANSFER')),
  professional_deposit_disposition TEXT NOT NULL CHECK(professional_deposit_disposition IN ('NONE','RETURN','RETAIN','CONVERT_TO_CREDIT','TRANSFER')),
  payment_disposition TEXT NOT NULL CHECK(payment_disposition IN ('NONE','REFUND','CONVERT_TO_CREDIT','RETAIN')),
  receivable_disposition TEXT NOT NULL CHECK(receivable_disposition IN ('KEEP','CANCEL')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,id,version), FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE TABLE no_show_policies (
  id TEXT NOT NULL, tenant_id TEXT NOT NULL, version INTEGER NOT NULL,
  service_id TEXT, status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')),
  tolerance_minutes INTEGER NOT NULL CHECK(tolerance_minutes >= 0),
  deposit_disposition TEXT NOT NULL CHECK(deposit_disposition IN ('NONE','RETURN','RETAIN','CONVERT_TO_CREDIT','TRANSFER')),
  relationship_impact TEXT NOT NULL CHECK(relationship_impact IN ('NONE','NO_SHOW')),
  effective_from TEXT NOT NULL, effective_until TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,id,version), FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE TABLE financial_reconciliation_issues (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  issue_type TEXT NOT NULL CHECK(issue_type IN ('STALE_FINANCIAL_DECISION','FINANCIAL_DECISION_CONFLICT','FINANCIAL_STATE_INCONSISTENT')),
  reason_code TEXT NOT NULL,
  expected_fingerprint TEXT NOT NULL,
  actual_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('OPEN','RESOLVED')) DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(tenant_id,source_event_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
CREATE TABLE identities (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (issuer, subject)
);
INSERT INTO "identities" ("id","issuer","subject","active","created_at","updated_at") VALUES('actor-dev-admin','synthetic-local','actor-dev-admin',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "identities" ("id","issuer","subject","active","created_at","updated_at") VALUES('actor-dev-reception','synthetic-local','actor-dev-reception',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "identities" ("id","issuer","subject","active","created_at","updated_at") VALUES('actor-dev-professional','synthetic-local','actor-dev-professional',1,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
CREATE TABLE tenant_memberships (
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  professional_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, actor_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (actor_id) REFERENCES identities(id),
  FOREIGN KEY (tenant_id, professional_id) REFERENCES professionals(tenant_id, id)
);
INSERT INTO "tenant_memberships" ("tenant_id","actor_id","active","professional_id","created_at","updated_at") VALUES('tenant-dev-001','actor-dev-admin',1,NULL,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "tenant_memberships" ("tenant_id","actor_id","active","professional_id","created_at","updated_at") VALUES('tenant-other','actor-dev-admin',1,NULL,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "tenant_memberships" ("tenant_id","actor_id","active","professional_id","created_at","updated_at") VALUES('tenant-dev-001','actor-dev-reception',1,NULL,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "tenant_memberships" ("tenant_id","actor_id","active","professional_id","created_at","updated_at") VALUES('tenant-other','actor-dev-reception',1,NULL,'2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
INSERT INTO "tenant_memberships" ("tenant_id","actor_id","active","professional_id","created_at","updated_at") VALUES('tenant-dev-001','actor-dev-professional',1,'mock-professional-ana','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z');
CREATE TABLE roles (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  PRIMARY KEY (tenant_id, name),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
INSERT INTO "roles" ("tenant_id","name","active") VALUES('tenant-dev-001','tenant_admin',1);
INSERT INTO "roles" ("tenant_id","name","active") VALUES('tenant-other','tenant_admin',1);
INSERT INTO "roles" ("tenant_id","name","active") VALUES('tenant-dev-001','reception',1);
INSERT INTO "roles" ("tenant_id","name","active") VALUES('tenant-other','reception',1);
INSERT INTO "roles" ("tenant_id","name","active") VALUES('tenant-dev-001','professional',1);
CREATE TABLE permissions (code TEXT PRIMARY KEY);
INSERT INTO "permissions" ("code") VALUES('agenda.read');
INSERT INTO "permissions" ("code") VALUES('customer.create');
INSERT INTO "permissions" ("code") VALUES('customer.read');
INSERT INTO "permissions" ("code") VALUES('customer.history.read');
INSERT INTO "permissions" ("code") VALUES('professional.create');
INSERT INTO "permissions" ("code") VALUES('professional.read');
INSERT INTO "permissions" ("code") VALUES('service.create');
INSERT INTO "permissions" ("code") VALUES('service.read');
INSERT INTO "permissions" ("code") VALUES('appointment.create');
INSERT INTO "permissions" ("code") VALUES('appointment.confirm');
INSERT INTO "permissions" ("code") VALUES('appointment.check-in');
INSERT INTO "permissions" ("code") VALUES('appointment.reschedule');
INSERT INTO "permissions" ("code") VALUES('appointment.cancel');
INSERT INTO "permissions" ("code") VALUES('appointment.no-show');
INSERT INTO "permissions" ("code") VALUES('appointment.package.assign');
INSERT INTO "permissions" ("code") VALUES('session.start');
INSERT INTO "permissions" ("code") VALUES('session.complete');
INSERT INTO "permissions" ("code") VALUES('receivable.read');
INSERT INTO "permissions" ("code") VALUES('payment.create');
INSERT INTO "permissions" ("code") VALUES('payment.read');
INSERT INTO "permissions" ("code") VALUES('ledger.read');
INSERT INTO "permissions" ("code") VALUES('clinical.photo.upload');
INSERT INTO "permissions" ("code") VALUES('clinical.photo.read');
INSERT INTO "permissions" ("code") VALUES('technical-form.create');
INSERT INTO "permissions" ("code") VALUES('technical-form.publish');
INSERT INTO "permissions" ("code") VALUES('technical-form.read');
INSERT INTO "permissions" ("code") VALUES('session.technical.update');
INSERT INTO "permissions" ("code") VALUES('equipment.create');
INSERT INTO "permissions" ("code") VALUES('equipment.update');
INSERT INTO "permissions" ("code") VALUES('equipment.status.change');
INSERT INTO "permissions" ("code") VALUES('equipment.read');
INSERT INTO "permissions" ("code") VALUES('variation-policy.configure');
INSERT INTO "permissions" ("code") VALUES('intercurrence.report');
INSERT INTO "permissions" ("code") VALUES('intercurrence.resolve');
INSERT INTO "permissions" ("code") VALUES('intercurrence.read');
CREATE TABLE role_permissions (
  tenant_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (tenant_id, role_name, permission_code),
  FOREIGN KEY (tenant_id, role_name) REFERENCES roles(tenant_id, name),
  FOREIGN KEY (permission_code) REFERENCES permissions(code)
);
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','agenda.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','customer.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','customer.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','customer.history.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','professional.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','professional.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','service.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','service.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','appointment.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','appointment.confirm');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','appointment.check-in');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','appointment.reschedule');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','appointment.cancel');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','appointment.no-show');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','appointment.package.assign');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','session.start');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','session.complete');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','receivable.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','payment.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','payment.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','ledger.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','clinical.photo.upload');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','clinical.photo.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','technical-form.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','technical-form.publish');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','technical-form.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','session.technical.update');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','equipment.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','equipment.update');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','equipment.status.change');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','equipment.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','variation-policy.configure');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','intercurrence.report');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','intercurrence.resolve');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','tenant_admin','intercurrence.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','agenda.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','customer.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','customer.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','customer.history.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','professional.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','professional.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','service.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','service.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','appointment.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','appointment.confirm');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','appointment.check-in');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','appointment.reschedule');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','appointment.cancel');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','appointment.no-show');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','appointment.package.assign');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','session.start');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','session.complete');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','receivable.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','payment.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','payment.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','ledger.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','clinical.photo.upload');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','clinical.photo.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','technical-form.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','technical-form.publish');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','technical-form.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','session.technical.update');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','equipment.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','equipment.update');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','equipment.status.change');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','equipment.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','variation-policy.configure');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','intercurrence.report');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','intercurrence.resolve');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','tenant_admin','intercurrence.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','reception','agenda.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','reception','customer.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','reception','professional.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','reception','service.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','reception','appointment.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','reception','appointment.confirm');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','reception','appointment.check-in');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','reception','agenda.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','reception','customer.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','reception','professional.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','reception','service.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','reception','appointment.create');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','reception','appointment.confirm');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-other','reception','appointment.check-in');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','professional','agenda.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','professional','professional.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','professional','service.read');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','professional','session.start');
INSERT INTO "role_permissions" ("tenant_id","role_name","permission_code") VALUES('tenant-dev-001','professional','session.complete');
CREATE TABLE membership_roles (
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  PRIMARY KEY (tenant_id, actor_id, role_name),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES tenant_memberships(tenant_id, actor_id),
  FOREIGN KEY (tenant_id, role_name) REFERENCES roles(tenant_id, name)
);
INSERT INTO "membership_roles" ("tenant_id","actor_id","role_name") VALUES('tenant-dev-001','actor-dev-admin','tenant_admin');
INSERT INTO "membership_roles" ("tenant_id","actor_id","role_name") VALUES('tenant-other','actor-dev-admin','tenant_admin');
INSERT INTO "membership_roles" ("tenant_id","actor_id","role_name") VALUES('tenant-dev-001','actor-dev-reception','reception');
INSERT INTO "membership_roles" ("tenant_id","actor_id","role_name") VALUES('tenant-other','actor-dev-reception','reception');
INSERT INTO "membership_roles" ("tenant_id","actor_id","role_name") VALUES('tenant-dev-001','actor-dev-professional','professional');
CREATE TABLE media_capacity (
  bucket TEXT PRIMARY KEY CHECK (bucket = 'beauty-r2'),
  limit_bytes INTEGER NOT NULL CHECK (limit_bytes = 8000000000),
  charged_bytes INTEGER NOT NULL DEFAULT 0 CHECK (charged_bytes >= 0),
  inventory_approved INTEGER NOT NULL DEFAULT 0 CHECK (inventory_approved IN (0,1)),
  policy_approved INTEGER NOT NULL DEFAULT 0 CHECK (policy_approved IN (0,1)),
  writers_coordinated INTEGER NOT NULL DEFAULT 0 CHECK (writers_coordinated IN (0,1)),
  approval_reference TEXT
);
INSERT INTO "media_capacity" ("bucket","limit_bytes","charged_bytes","inventory_approved","policy_approved","writers_coordinated","approval_reference") VALUES('beauty-r2',8000000000,0,0,0,0,NULL);
CREATE TABLE tenant_media_capacity (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  limit_bytes INTEGER NOT NULL CHECK (limit_bytes > 0 AND limit_bytes <= 8000000000),
  charged_bytes INTEGER NOT NULL DEFAULT 0 CHECK (charged_bytes >= 0)
);
CREATE TABLE media_objects (
  object_key TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  domain TEXT NOT NULL CHECK (domain IN ('clinical','profile')),
  resource_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  status TEXT NOT NULL CHECK (status IN ('RESERVED','STORED','DELETE_PENDING','RELEASED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,operation,idempotency_key)
);
CREATE TABLE profile_images (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
  owner_type TEXT NOT NULL CHECK(owner_type='customer'), owner_id TEXT NOT NULL REFERENCES customers(id),
  image_role TEXT NOT NULL CHECK(image_role='PROFILE'), object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 2000000),
  checksum TEXT NOT NULL, etag TEXT, version INTEGER NOT NULL CHECK(version > 0),
  status TEXT NOT NULL CHECK(status IN ('PENDING','AVAILABLE','RETIRED','REMOVED')),
  uploaded_by TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,idempotency_key)
);
CREATE TABLE profile_image_slots (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), owner_id TEXT NOT NULL REFERENCES customers(id),
  image_role TEXT NOT NULL CHECK(image_role='PROFILE'), version INTEGER NOT NULL DEFAULT 0,
  image_id TEXT REFERENCES profile_images(id), PRIMARY KEY(tenant_id,owner_id,image_role)
);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',31);
CREATE UNIQUE INDEX ux_tenants_document ON tenants(document);
CREATE INDEX idx_professionals_tenant_status ON professionals(tenant_id, status);
CREATE INDEX idx_services_tenant_status ON services(tenant_id, status);
CREATE INDEX idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX idx_customers_tenant_document ON customers(tenant_id, document);
CREATE INDEX idx_customers_tenant_email ON customers(tenant_id, email);
CREATE UNIQUE INDEX ux_idempotency_tenant_operation_key ON idempotency_records(tenant_id, operation, idempotency_key);
CREATE INDEX idx_idempotency_tenant_created ON idempotency_records(tenant_id, created_at);
CREATE INDEX idx_audit_tenant_occurred ON audit_events(tenant_id, occurred_at);
CREATE INDEX idx_audit_resource ON audit_events(tenant_id, resource_type, resource_id);
CREATE INDEX idx_outbox_status_created ON outbox_events(status, created_at);
CREATE INDEX idx_outbox_tenant_created ON outbox_events(tenant_id, created_at);
CREATE INDEX idx_appointments_professional_time ON appointments(tenant_id, professional_id, starts_at, ends_at);
CREATE INDEX idx_appointments_tenant_time ON appointments(tenant_id, starts_at);
CREATE INDEX idx_appointments_customer_time ON appointments(tenant_id, customer_id, starts_at);
CREATE INDEX idx_licenses_tenant_starts ON licenses(tenant_id, starts_at DESC);
CREATE INDEX idx_assessments_admission ON assessments(tenant_id, customer_id, service_id, professional_id, performed_at DESC);
CREATE INDEX idx_discount_policies_applicable ON discount_policies(tenant_id, customer_profile, valid_from, valid_until, priority);
CREATE UNIQUE INDEX ux_deposits_tenant_appointment ON deposits(tenant_id, appointment_id);
CREATE INDEX idx_deposits_tenant_status ON deposits(tenant_id, status, expires_at);
CREATE INDEX idx_outbox_dispatchable ON outbox_events(status, available_at, created_at, id);
CREATE INDEX idx_outbox_expired_claims ON outbox_events(status, claim_expires_at);
CREATE INDEX idx_sessions_tenant_appointment ON sessions(tenant_id, appointment_id);
CREATE INDEX idx_sessions_tenant_professional_status ON sessions(tenant_id, professional_id, status);
CREATE UNIQUE INDEX ux_technical_forms_active ON technical_forms(tenant_id, service_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_technical_forms_service_status ON technical_forms(tenant_id, service_id, status);
CREATE INDEX idx_technical_form_fields_order ON technical_form_fields(tenant_id, form_id, field_order);
CREATE INDEX idx_session_technical_fields_order ON session_technical_field_snapshots(tenant_id, snapshot_id, field_order);
CREATE INDEX idx_session_technical_values_session ON session_technical_values(tenant_id, session_id);
CREATE INDEX idx_session_power_records_session ON session_power_records(tenant_id, session_id, recorded_at);
CREATE INDEX idx_equipment_tenant_status ON equipment(tenant_id, status);
CREATE INDEX idx_equipment_compatibility_service ON equipment_service_compatibility(tenant_id, service_id, equipment_id);
CREATE INDEX idx_session_equipment_usage_session ON session_equipment_usage(tenant_id, session_id);
CREATE INDEX idx_variation_policies_lookup ON variation_policies(tenant_id, service_id, parameter_key, status);
CREATE INDEX idx_session_variation_alerts_session ON session_variation_alerts(tenant_id, session_id, status);
CREATE INDEX idx_intercurrences_session ON intercurrences(tenant_id, session_id);
CREATE INDEX idx_intercurrences_customer_status ON intercurrences(tenant_id, customer_id, status);
CREATE INDEX idx_clinical_restrictions_customer ON clinical_restrictions(tenant_id, customer_id, status, blocks_new_appointments);
CREATE INDEX idx_customer_clinical_restrictions_admission ON customer_clinical_restrictions(tenant_id, customer_id, status, blocks_new_appointments);
CREATE INDEX idx_clinical_photo_session_status ON clinical_photo_attachments(tenant_id, session_id, status);
CREATE INDEX idx_clinical_photo_intercurrence_status ON clinical_photo_attachments(tenant_id, intercurrence_id, status);
CREATE INDEX idx_clinical_photo_tenant_id ON clinical_photo_attachments(tenant_id, id);
CREATE INDEX idx_customer_timeline_customer_time ON customer_timeline_events(tenant_id, customer_id, occurred_at DESC, id DESC);
CREATE INDEX idx_customer_timeline_customer_type ON customer_timeline_events(tenant_id, customer_id, event_type, occurred_at DESC, id DESC);
CREATE INDEX idx_returns_pending_due ON return_recommendations(tenant_id, status, recommended_for);
CREATE INDEX idx_customer_packages_customer ON customer_packages(tenant_id,customer_id,status,valid_until);
CREATE INDEX idx_customer_packages_service ON customer_packages(tenant_id,service_id,status);
CREATE INDEX idx_package_movements_package ON package_movements(tenant_id,customer_package_id,occurred_at DESC,id DESC);
CREATE INDEX idx_package_movements_session ON package_movements(tenant_id,session_id,type);
CREATE INDEX idx_receivables_customer ON receivables(tenant_id,customer_id,status,created_at);
CREATE INDEX idx_payments_receivable ON payments(tenant_id,receivable_id,received_at,id);
CREATE INDEX idx_ledger_receivable ON ledger_movements(tenant_id,receivable_id,occurred_at,id);
CREATE INDEX idx_refunds_payment ON refunds(tenant_id,payment_id,refunded_at,id);
CREATE INDEX idx_cancellation_policy_lookup ON cancellation_policies(tenant_id,service_id,status,effective_from,effective_until,version);
CREATE INDEX idx_no_show_policy_lookup ON no_show_policies(tenant_id,service_id,status,effective_from,effective_until,version);
CREATE INDEX idx_financial_reconciliation_open ON financial_reconciliation_issues(tenant_id,status,created_at);
CREATE UNIQUE INDEX ux_professionals_tenant_id ON professionals(tenant_id, id);
CREATE INDEX idx_memberships_actor_active ON tenant_memberships(actor_id, active);
CREATE INDEX media_objects_resource ON media_objects(tenant_id,domain,resource_id);
CREATE UNIQUE INDEX clinical_photo_idempotency ON clinical_photo_attachments(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX profile_image_active ON profile_images(tenant_id,owner_type,owner_id,image_role) WHERE status='AVAILABLE';
CREATE INDEX profile_image_owner ON profile_images(tenant_id,owner_id,status);
CREATE TRIGGER trg_session_technical_values_writable
BEFORE INSERT ON session_technical_values
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
CREATE TRIGGER trg_session_power_writable
BEFORE INSERT ON session_power_records
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
CREATE TRIGGER trg_session_equipment_writable
BEFORE INSERT ON session_equipment_usage
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
CREATE TRIGGER trg_session_intercurrence_writable
BEFORE INSERT ON intercurrences
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
CREATE TRIGGER trg_session_photo_intent_writable
BEFORE INSERT ON clinical_photo_attachments
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id AND status = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS'); END;
CREATE TRIGGER uow_assertion_check BEFORE INSERT ON uow_assertions WHEN changes() <> NEW.expected_changes BEGIN SELECT RAISE(ABORT,'UNIT_OF_WORK_EXPECTED_CHANGES'); END;
CREATE TRIGGER media_capacity_reserve BEFORE INSERT ON media_objects BEGIN
  SELECT CASE WHEN NEW.status != 'RESERVED' THEN RAISE(ABORT,'MEDIA_INVALID_RESERVATION') END;
  UPDATE media_capacity SET charged_bytes = charged_bytes + NEW.size_bytes
    WHERE bucket = 'beauty-r2' AND inventory_approved = 1 AND policy_approved = 1
      AND writers_coordinated = 1 AND approval_reference IS NOT NULL
      AND charged_bytes + NEW.size_bytes <= limit_bytes;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT,'MEDIA_CAPACITY_UNAVAILABLE') END;
  UPDATE tenant_media_capacity SET charged_bytes = charged_bytes + NEW.size_bytes
    WHERE tenant_id = NEW.tenant_id AND charged_bytes + NEW.size_bytes <= limit_bytes;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT,'MEDIA_TENANT_QUOTA_UNAVAILABLE') END;
END;
CREATE TRIGGER media_capacity_immutable BEFORE UPDATE ON media_objects
WHEN NEW.object_key != OLD.object_key OR NEW.tenant_id != OLD.tenant_id
  OR NEW.size_bytes != OLD.size_bytes OR NEW.domain != OLD.domain
  OR NEW.operation != OLD.operation OR NEW.idempotency_key != OLD.idempotency_key
  OR NEW.resource_id != OLD.resource_id OR OLD.status = 'RELEASED'
BEGIN SELECT RAISE(ABORT,'MEDIA_RESERVATION_IMMUTABLE'); END;
CREATE TRIGGER media_capacity_release AFTER UPDATE OF status ON media_objects
WHEN NEW.status = 'RELEASED' AND OLD.status != 'RELEASED' BEGIN
  UPDATE media_capacity SET charged_bytes = charged_bytes - OLD.size_bytes WHERE bucket = 'beauty-r2';
  UPDATE tenant_media_capacity SET charged_bytes = charged_bytes - OLD.size_bytes WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER media_capacity_no_delete BEFORE DELETE ON media_objects
BEGIN SELECT RAISE(ABORT,'MEDIA_LEDGER_DELETE_FORBIDDEN'); END;
CREATE TRIGGER profile_image_limit_insert BEFORE INSERT ON profile_images
WHEN NEW.size_bytes > 300000
BEGIN SELECT RAISE(ABORT, 'PROFILE_IMAGE_SIZE_EXCEEDED'); END;
CREATE TRIGGER profile_image_limit_update BEFORE UPDATE ON profile_images
WHEN (NEW.size_bytes != OLD.size_bytes AND NEW.size_bytes > 300000)
  OR (OLD.status = 'PENDING' AND NEW.status = 'AVAILABLE' AND NEW.size_bytes > 300000)
BEGIN SELECT RAISE(ABORT, 'PROFILE_IMAGE_SIZE_EXCEEDED'); END;
