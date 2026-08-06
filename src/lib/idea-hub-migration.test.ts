import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0072_idea_hub_module.sql'), 'utf8');
const repairMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0080_sidebar_gm_operations_idea_schema_repair.sql'), 'utf8');
const storageRepairMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260806121405_idea_hub_attachment_storage_repair.sql'), 'utf8');

describe('Idea Hub migration', () => {
  it('creates the required tables and unique support constraint', () => {
    for (const table of ['idea_categories', 'ideas', 'idea_supports', 'idea_comments', 'idea_attachments', 'idea_status_history', 'idea_activity_logs']) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toContain('unique(idea_id, employee_id)');
  });

  it('publishes submitted ideas immediately without approval statuses', () => {
    expect(migration).toContain("status text not null default 'Submitted'");
    expect(migration).not.toContain('Pending Approval');
    expect(migration).not.toContain("'Approved'");
    expect(migration).not.toContain("'Rejected'");
  });

  it('enforces permissions with RLS and status guard triggers', () => {
    expect(migration).toContain('alter table public.ideas enable row level security');
    expect(migration).toContain("public.has_permission('ideas.manage_status')");
    expect(migration).toContain('create trigger ideas_update_permission_guard');
    expect(migration).toContain('A reason is required when an idea is marked Not Proceeding.');
  });

  it('uses private storage for attachments', () => {
    expect(migration).toContain("values('idea-attachments','idea-attachments',false)");
    expect(migration).toContain('idea attachment reads');
  });

  it('repairs production schema exposure for implemented Idea Hub tables', () => {
    for (const table of ['idea_categories', 'ideas', 'idea_supports', 'idea_comments', 'idea_attachments', 'idea_status_history', 'idea_activity_logs']) {
      expect(repairMigration).toContain(`public.${table}`);
    }
    expect(repairMigration).toContain("grant select, insert, update, delete on public.ideas to authenticated");
    expect(repairMigration).toContain("notify pgrst, 'reload schema'");
  });

  it('repairs the private attachment bucket with scoped object policies', () => {
    expect(storageRepairMigration).toContain("'idea-attachments'");
    expect(storageRepairMigration).toContain('file_size_limit');
    expect(storageRepairMigration).toContain("'image/png'");
    expect(storageRepairMigration).toContain('idea attachment uploads');
    expect(storageRepairMigration).toContain('idea attachment reads');
    expect(storageRepairMigration).toContain('idea attachment deletes');
    expect(storageRepairMigration).not.toContain('using (true)');
  });
});
