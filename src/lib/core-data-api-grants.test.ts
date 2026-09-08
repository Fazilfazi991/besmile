import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260908014111_restore_core_data_api_grants.sql', import.meta.url),
  'utf8',
).toLowerCase();
const patientRelationshipMigration = readFileSync(
  new URL('../../supabase/migrations/20260908021000_restore_patient_relation_read_grants.sql', import.meta.url),
  'utf8',
).toLowerCase();
const notificationDefaultsMigration = readFileSync(
  new URL('../../supabase/migrations/20260908022000_restore_extended_notification_defaults.sql', import.meta.url),
  'utf8',
).toLowerCase();
const chatReplyGrantMigration = readFileSync(
  new URL('../../supabase/migrations/20260908023000_grant_chat_reply_policy_helper.sql', import.meta.url),
  'utf8',
).toLowerCase();
const storageRelationGrantMigration = readFileSync(
  new URL('../../supabase/migrations/20260908024000_restore_storage_policy_relation_grants.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('core Data API grants', () => {
  it('requires RLS before restoring foundational table access', () => {
    expect(migration).toContain('relation.relrowsecurity');
    expect(migration).toContain('refusing data api grant');
  });

  it('restores authenticated profile and task access without anonymous DML', () => {
    expect(migration).toContain('grant select on table');
    expect(migration).toContain('public.profiles');
    expect(migration).toContain('public.tasks');
    expect(migration).toContain('to authenticated');
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete|all privileges)[\s\S]*?to\s+anon/);
  });

  it('keeps direct profile deletion revoked', () => {
    expect(migration).toContain('revoke delete on table public.profiles from authenticated, anon');
  });
});

describe('patient relationship Data API grants', () => {
  it('allows authenticated relationship reads only behind existing patient RLS', () => {
    expect(patientRelationshipMigration).toContain("relation.relname = 'patients'");
    expect(patientRelationshipMigration).toContain('relation.relrowsecurity');
    expect(patientRelationshipMigration).toContain('grant select on table public.patients to authenticated');
    expect(patientRelationshipMigration).toContain('revoke all on table public.patients from anon');
    expect(patientRelationshipMigration).not.toMatch(/grant\s+(?:insert|update|delete|all privileges).*patients\s+to authenticated/);
  });
});

describe('extended notification defaults repair', () => {
  it('keeps trailing notification metadata optional for current trigger calls', () => {
    expect(notificationDefaultsMigration).toContain("notification_category text default 'system'");
    expect(notificationDefaultsMigration).toContain("notification_metadata jsonb default '{}'::jsonb");
    expect(notificationDefaultsMigration).toContain('security definer');
    expect(notificationDefaultsMigration).toContain('target is distinct from sender');
  });
});

describe('chat reply policy helper grant', () => {
  it('allows authenticated policy evaluation without exposing anonymous execution', () => {
    expect(chatReplyGrantMigration).toContain('grant execute on function public.chat_reply_target_is_valid(uuid, uuid) to authenticated');
    expect(chatReplyGrantMigration).toContain('revoke all on function public.chat_reply_target_is_valid(uuid, uuid) from public, anon');
  });
});

describe('storage policy relationship grants', () => {
  it('allows authenticated policy reads only when every relation retains RLS', () => {
    expect(storageRelationGrantMigration).toContain('relation.relrowsecurity');
    expect(storageRelationGrantMigration).toContain('public.patient_documents');
    expect(storageRelationGrantMigration).toContain('public.crm_sales_documents');
    expect(storageRelationGrantMigration).toContain('public.idea_attachments');
    expect(storageRelationGrantMigration).toContain('to authenticated');
    expect(storageRelationGrantMigration).toContain('from anon');
    expect(storageRelationGrantMigration).not.toMatch(/grant\s+(?:insert|update|delete|all privileges)[\s\S]*?to authenticated/);
  });
});
