import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql=readFileSync(join(process.cwd(),'supabase/migrations/20260814090000_batch13_innovation_hub_lifecycle.sql'),'utf8');

describe('Batch 13 database security',()=>{
  it('uses effective additive permissions and self/all RLS',()=>{
    for(const code of ['innovation.view_self','innovation.create','innovation.view_all','innovation.review','innovation.manage'])expect(sql).toContain(code);
    expect(sql).toContain("submitted_by=auth.uid() and public.has_permission('innovation.view_self')");
    expect(sql).toContain("public.has_permission('innovation.view_all')");
    expect(sql).toContain('public.innovation_can_view(idea_id)');
  });
  it('denies direct social support and protects child rows and files',()=>{
    expect(sql).toContain('revoke all on public.idea_supports from authenticated');
    expect(sql).toContain('innovation notes scoped read');
    expect(sql).toContain('innovation history scoped read');
    expect(sql).toContain("bucket_id='idea-attachments' and public.innovation_can_view");
    expect(sql).not.toContain("public=true");
  });
  it('enforces workflow, concurrency, owner, progress, and task security server-side',()=>{
    expect(sql).toContain('for update');
    expect(sql).toContain("current_row.status<>expected_status");
    expect(sql).toContain("current_row.status='under_review' and next_status in ('approved','rejected')");
    expect(sql).toContain('next_progress<0 or next_progress>100');
    expect(sql).toContain("p.status='active' and coalesce(p.is_employee,true) and coalesce(p.workforce_visible,true)");
    expect(sql).toContain("public.has_permission('tasks.assign')");
  });
  it('records history/audit and prevents retry notification duplication',()=>{
    expect(sql).toContain('innovation_history_request_key_idx');
    expect(sql).toContain('insert into public.audit_logs');
    expect(sql).toContain('not exists(select 1 from public.notifications');
    expect(sql).toContain('request_key');
  });
});
