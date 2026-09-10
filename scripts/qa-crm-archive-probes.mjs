import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

export async function verifyCrmArchive() {
  const env = process.env;
  if (env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe' || new URL(env.BSMILE_QA_SUPABASE_URL).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('CRM archive probes require verified QA');
  const clients = [];
  const checks = [];
  const fixtures = [];
  const assert = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const make = () => { const db = createClient(env.BSMILE_QA_SUPABASE_URL, env.BSMILE_QA_SUPABASE_ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}}); clients.push(db); return db; };
  const signed = async role => {
    const db = make();
    const result = await db.auth.signInWithPassword({email: env[`BSMILE_QA_${role}_EMAIL`], password: env[`BSMILE_QA_${role}_PASSWORD`]});
    if (result.error) throw new Error(`${role} QA login failed (${result.error.code})`);
    return {db, user: result.data.user};
  };
  try {
    const employee = await signed('EMPLOYEE');
    const anon = make();
    for (const role of ['ADMIN', 'GENERAL_MANAGER']) {
      const {db, user} = await signed(role);
      const id = crypto.randomUUID();
      const row = {id, full_name: `RELEASE_GATE_CRM_ARCHIVE_${role}_${id}`, phone: '0000000000', assigned_to: user.id, created_by: user.id};
      const created = await db.from('crm_leads').insert(row);
      assert(!created.error, `${role}: disposable lead created`);
      fixtures.push(id);
      const controlId = crypto.randomUUID();
      const control = await db.from('crm_leads').insert({...row, id: controlId, full_name: `${row.full_name}_CONTROL`});
      assert(!control.error, `${role}: visible control lead created`);
      fixtures.push(controlId);
      const historyId = crypto.randomUUID();
      const history = {id: historyId, lead_id: id, follow_up_at: new Date().toISOString(), note: 'Disposable archive preservation guard', created_by: user.id};
      try {
        assert(!(await db.from('crm_lead_followups').insert(history)).error, `${role}: follow-up history created`);
        const before = await db.from('crm_leads').select('id,archived_at,assigned_to,created_by').eq('id', id).single();
        assert(!before.error && before.data.archived_at === null, `${role}: fixture initially live`);
        const employeeDenied = await employee.db.rpc('archive_crm_lead', {target_lead: id});
        assert(employeeDenied.error?.code === '42501', `${role}: unrelated employee denied`);
        const anonymousDenied = await anon.rpc('archive_crm_lead', {target_lead: id});
        assert(anonymousDenied.error?.code === '42501', `${role}: anonymous denied`);
        const unchanged = await db.from('crm_leads').select('id,archived_at,assigned_to,created_by').eq('id', id).single();
        assert(!unchanged.error && JSON.stringify(unchanged.data) === JSON.stringify(before.data), `${role}: denied attempts leave row unchanged`);
        const result = await db.rpc('archive_crm_lead', {target_lead: id});
        assert(!result.error && result.data?.id === id && Number.isFinite(Date.parse(result.data.archived_at)), `${role}: authorized archive returns verified receipt`);
        const after = await db.from('crm_leads').select('id').eq('id', id);
        assert(!after.error && after.data.length === 0, `${role}: archived row hidden even by direct ID`);
        // Unique-key violations prove the physical IDs still exist despite SELECT
        // RLS hiding them. These failed INSERT statements cannot modify either row.
        // No privileged verification client or broader SELECT policy is required.
        const rowStillExists = await db.from('crm_leads').insert(row);
        assert(rowStillExists.error?.code === '23505', `${role}: physical archived row retained`);
        const historyStillExists = await db.from('crm_lead_followups').insert({...history, lead_id: controlId});
        assert(historyStillExists.error?.code === '23505', `${role}: follow-up history retained without cascade deletion`);
        const population = await db.from('crm_leads').select('id').in('id', [id, controlId]).is('archived_at', null);
        assert(!population.error && population.data.length === 1 && population.data[0].id === controlId, `${role}: canonical live population excludes only archived fixture`);
        const repeated = await db.rpc('archive_crm_lead', {target_lead: id});
        assert(repeated.error?.code === '42501', `${role}: repeated archive cannot falsely succeed`);
        const missing = await db.rpc('archive_crm_lead', {target_lead: crypto.randomUUID()});
        assert(missing.error?.code === '42501', `${role}: missing and inaccessible IDs fail safely`);
      } finally {
        // Supported soft archive only; never delete fixtures or business history.
        const remaining = await db.from('crm_leads').select('id').eq('id', id);
        if (remaining.error) throw new Error('Could not verify QA fixture cleanup');
        if (remaining.data.length) {
          const cleanup = await db.rpc('archive_crm_lead', {target_lead: id});
          if (cleanup.error) throw new Error(`QA fixture archive failed: ${id}`);
        }
        const cleanupControl = await db.rpc('archive_crm_lead', {target_lead: controlId});
        if (cleanupControl.error) throw new Error(`QA control fixture archive failed: ${controlId}`);
      }
    }
    return {checks, fixtures, total: checks.length};
  } finally {
    await Promise.all(clients.map(db => db.auth.signOut()));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify({status: 'PASS', ...await verifyCrmArchive()}, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
