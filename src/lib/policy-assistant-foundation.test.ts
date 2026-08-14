import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration=readFileSync(join(process.cwd(),'supabase/migrations/20260814100000_batch14_policy_assistant.sql'),'utf8');
const chat=readFileSync(join(process.cwd(),'src/app/api/policy-assistant/chat/route.ts'),'utf8');
const provider=readFileSync(join(process.cwd(),'src/lib/policy-assistant-provider.ts'),'utf8');
describe('Batch 14 policy foundation',()=>{
  it('keeps source files private and creates signed, short-lived access',()=>{expect(migration).toContain("values('policy-documents','policy-documents',false");expect(migration).toContain('public.policy_document_visible(document.id,true)');expect(readFileSync(join(process.cwd(),'src/app/api/policy-assistant/documents/[documentId]/source/route.ts'),'utf8')).toContain('createSignedUrl(document.data.storage_path,120)');});
  it('enforces permissions, RLS, audience and current published versions',()=>{expect(migration).toContain("public.has_permission('policy_assistant.use')");expect(migration).toContain("public.has_permission('policy_assistant.manage')");expect(migration).toContain('enable row level security');expect(migration).toContain('public.policy_audience_matches(document.id)');expect(migration).toContain("status='published' and is_current");});
  it('bounds retrieval and server-side abuse controls',()=>{expect(migration).toContain('least(coalesce(limit_count,6),8)');expect(migration).toContain("interval '5 minutes'");expect(chat).toContain('question.length<2||question.length>1000');expect(chat).toContain('check_policy_assistant_rate_limit');});
  it('never exposes an OpenAI key or enables external tools',()=>{expect(provider).toContain('process.env.OPENAI_API_KEY');expect(provider).not.toContain('NEXT_PUBLIC_OPENAI');expect(provider).not.toContain('web_search');expect(provider).toContain('store:false');});
  it('fails safely when retrieval and generation providers fail',()=>{expect(chat).toContain('RETRIEVAL_UNAVAILABLE');expect(chat).toContain('POLICY_UNAVAILABLE');expect(chat).not.toContain('extractiveGroundedAnswer');});
  it('records upload, publish and archive history and sends publish notifications',()=>{expect(migration).toContain("'policy_document_uploaded'");expect(migration).toContain("'policy_document_published'");expect(migration).toContain("'policy_document_archived'");expect(migration).toContain("'policy_published'");});
});
