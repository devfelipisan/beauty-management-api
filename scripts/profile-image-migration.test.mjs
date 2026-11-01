import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('new limit preserves confirmed historical images and blocks new or pending excess', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE tenants(id TEXT PRIMARY KEY); CREATE TABLE customers(id TEXT PRIMARY KEY);',
  );
  db.exec(
    "INSERT INTO tenants VALUES ('t'); INSERT INTO customers VALUES ('old'),('pending'),('new'),('excess');",
  );
  db.exec(
    readFileSync('database/d1/migrations/0029_profile_images.sql', 'utf8'),
  );
  const insert = db.prepare(
    "INSERT INTO profile_images(id,tenant_id,owner_type,owner_id,image_role,object_key,content_type,size_bytes,checksum,version,status,uploaded_by,idempotency_key,created_at,updated_at) VALUES (?, 't','customer',?,'PROFILE',?,'image/jpeg',?,'x',1,?,'a',?,'now','now')",
  );
  insert.run('historical', 'old', 'old-key', 400000, 'AVAILABLE', 'old-idem');
  insert.run(
    'pending',
    'pending',
    'pending-key',
    400000,
    'PENDING',
    'pending-idem',
  );
  db.exec(
    readFileSync('database/d1/migrations/0030_profile_image_limit.sql', 'utf8'),
  );
  insert.run('boundary', 'new', 'new-key', 300000, 'PENDING', 'new-idem');
  assert.throws(
    () =>
      insert.run(
        'excess',
        'excess',
        'excess-key',
        300001,
        'PENDING',
        'excess-idem',
      ),
    /PROFILE_IMAGE_SIZE_EXCEEDED/,
  );
  assert.throws(
    () =>
      db.exec(
        "UPDATE profile_images SET status='AVAILABLE' WHERE id='pending'",
      ),
    /PROFILE_IMAGE_SIZE_EXCEEDED/,
  );
  assert.throws(
    () =>
      db.exec(
        "UPDATE profile_images SET size_bytes=300001 WHERE id='boundary'",
      ),
    /PROFILE_IMAGE_SIZE_EXCEEDED/,
  );
  db.exec("UPDATE profile_images SET status='RETIRED' WHERE id='historical'");
  db.exec("UPDATE profile_images SET status='REMOVED' WHERE id='historical'");
  assert.equal(
    db
      .prepare("SELECT size_bytes FROM profile_images WHERE id='historical'")
      .get().size_bytes,
    400000,
  );
  db.close();
});
