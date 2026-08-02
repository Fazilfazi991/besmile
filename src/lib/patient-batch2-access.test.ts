import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { permissionCatalogue } from './permission-catalogue';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0058_patient_batch2_scoped_access_fix.sql'), 'utf8');
const uploadRoute = readFileSync(resolve(process.cwd(), 'src/app/api/patients/[patientId]/documents/upload/route.ts'), 'utf8');
const chatMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0059_chat_permission_boundary.sql'), 'utf8');
const announcementMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0060_announcement_selected_recipient_fix.sql'), 'utf8');

describe('Batch 2 patient access hardening', () => {
  it('catalogues the session permissions used by the patient manage API', () => {
    expect(permissionCatalogue).toEqual(expect.arrayContaining(['patient_sessions.create', 'patient_sessions.edit', 'patient_sessions.cancel']));
  });

  it('restores GM operational patient permissions without clinical-note elevation', () => {
    const gmSection = migration.slice(migration.indexOf('gm_permissions'), migration.indexOf('care_team_permissions'));
    expect(migration).toContain("'patient_sessions.create'");
    expect(migration).toContain("replace(lower(public.current_role()::text), ' ', '_') = 'general_manager'");
    expect(migration).toContain('or p.created_by = auth.uid()');
    expect(gmSection).not.toContain('clinical_notes.');
  });

  it('keeps intern patient access assignment-scoped', () => {
    expect(migration).toContain("'patients.view_assigned'");
    expect(migration).toContain("public.patient_is_assigned(p.id)");
  });

  it('recreates patient create and document upload finalization policies', () => {
    expect(migration).toContain('create policy "patient records create"');
    expect(migration).toContain('and created_by = auth.uid()');
    expect(migration).toContain('create policy "patient documents upload finalize"');
    expect(migration).toContain("storage_key like 'pending-%'");
  });

  it('avoids insert-returning RLS traps while creating patient document metadata', () => {
    expect(uploadRoute).toContain('pending-${crypto.randomUUID()}');
    expect(uploadRoute).toContain(".eq('storage_key',pendingKey).single()");
    expect(uploadRoute).not.toContain("}).select().single(); if (insertError)");
  });

  it('enforces chat.use in chat RPC and membership boundaries', () => {
    expect(chatMigration).toContain("select public.has_permission('chat.use')");
    expect(chatMigration).toContain("if not public.has_permission('chat.use') then");
    expect(chatMigration).toContain("not public.has_permission('chat.use', other_profile)");
    expect(chatMigration).toContain("not public.has_permission('chat.use', x)");
    expect(chatMigration).toContain("not public.has_permission('chat.use', member)");
  });

  it('allows authorized managers to target selected announcement recipients and notify them', () => {
    expect(announcementMigration).toContain("public.has_permission('announcements.manage')");
    expect(announcementMigration).toContain('recipient.announcement_id = announcements.id');
    expect(announcementMigration).toContain('notify_selected_announcement_recipient');
    expect(announcementMigration).toContain("announcement.audience_type = 'employees'");
    expect(announcementMigration).toContain("notification.type = 'new_announcement'");
  });
});
