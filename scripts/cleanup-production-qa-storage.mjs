import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const targets = {
  'employee-documents': [
    'company/e64c5750-b585-4cab-9478-2c1fbad3b26e/cc626439-d33d-4856-9e23-cb6e08afc276-qa-upload-valid.pdf',
    'company/e64c5750-b585-4cab-9478-2c1fbad3b26e/6514e0c9-1777-4f75-a14c-336499b8f2cc-CODEX-QA-document.pdf',
    'company/e64c5750-b585-4cab-9478-2c1fbad3b26e/e609199d-a6fa-4908-8c3e-21d2f80bed50-CODEX-QA-image.png',
    'company/e64c5750-b585-4cab-9478-2c1fbad3b26e/aff806c3-460c-40c7-b998-a8f6bff4dce7-CODEX-QA-document.pdf',
    'company/e64c5750-b585-4cab-9478-2c1fbad3b26e/28167386-333e-4745-ae7f-f2e438c8dc06-CODEX-QA-image.png',
    'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5/requests/040717b8-a40b-4f3c-9e2b-331f41775d89-8c428d9d-1d8b-48c6-84dc-705be9f9e307-CODEX-QA-document.pdf',
  ],
  'idea-attachments': [
    'ideas/12693c46-0561-4d7f-8042-5d84e3f06e7a/attachments/0d976bc3-a892-4a9b-b59a-83e06bb90f5b/1d7b7ef7-a92f-4203-af66-b613844af540.png',
    'ideas/de495485-a7c4-44c6-a1da-554ed274d5ae/attachments/acad01ce-e76e-44c7-8329-fffab91d3846/49fb667a-8c12-457b-ab10-89ff51c60b4b.pdf',
  ],
};

for (const [bucket, paths] of Object.entries(targets)) {
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw new Error(`${bucket}: ${error.message}`);
  for (const path of paths) {
    const result = await supabase.storage.from(bucket).download(path);
    if (!result.error) throw new Error(`${bucket}/${path} still exists after cleanup.`);
  }
  console.log(`${bucket}: verified ${paths.length} QA objects absent`);
}
