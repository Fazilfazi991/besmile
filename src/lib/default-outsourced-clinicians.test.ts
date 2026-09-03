import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(resolve(root, 'supabase/migrations/20260818153000_seed_default_outsourced_clinicians.sql'), 'utf8');
const photos = readdirSync(resolve(root, 'public/images/clinicians')).filter(file => file.endsWith('.webp'));

const clinicians = [
  'Anagha Pushppan', 'Dr. Xavier', 'Aiswarya P', 'Anushma VK', 'Adil Hussain', 'Diya Anthikat',
  'Devapriya Thirikkot', 'Anjana Krishna', 'Kallu Sajeev', 'Sreelekshmi A M', 'Deepika Jayaraj',
  'Kavya VR', 'Noufira M.N', 'Safna PV', 'Sana KS', 'Anjaly Varghese', 'Sanahira Shanavas',
  'Jasna RC', 'Surya PS', 'Sameeha Saleem', 'Athira Pothasseri',
];

describe('default outsourced clinicians seed', () => {
  it('seeds each supplied clinician once with a dedicated production portrait', () => {
    expect(clinicians).toHaveLength(21);
    expect(photos).toHaveLength(21);
    for (const clinician of clinicians) expect(migration).toContain(`'${clinician}'`);
    expect(migration.match(/\/images\/clinicians\//g)).toHaveLength(21);
  });

  it('is idempotent and remains in the existing outsourced clinician architecture', () => {
    expect(migration).toContain('public.outsourced_doctors');
    expect(migration).toContain("'outsourced'");
    expect(migration).toContain("regexp_replace(clinician.doctor_name");
    expect(migration).toContain('if target_id is null then');
    expect(migration).toContain('self_service_enabled, photo_url, notes');
    expect(migration).toContain('update public.outsourced_doctors');
    expect(migration).toContain("case when clinician_type is null or trim(clinician_type) = '' then 'outsourced' else clinician_type end");
    expect(migration).not.toContain('insert into public.profiles');
    expect(migration).not.toContain('insert into auth.users');
  });
});
