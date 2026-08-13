import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding Idea Hub demo data.');

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const ideas = [
  ['Improve Patient Follow-Up Workflow', 'Process Improvement', 'Submitted'],
  ['Monthly Team Learning Session', 'Workplace Improvement', 'Under Consideration'],
  ['Automated Appointment Reminder', 'Process Improvement', 'Implemented'],
  ['Social Media Content Calendar', 'Sales and Marketing', 'Submitted'],
  ['Employee Recognition Program', 'Workplace Improvement', 'Submitted'],
  ['Digital Patient Intake Form', 'Process Improvement', 'Under Consideration'],
  ['Referral Campaign Tracking', 'Sales and Marketing', 'Submitted'],
  ['Weekly Operations Summary', 'Workplace Improvement', 'Implemented'],
];
const demoMarker = '[BSMILE QA DEMO]';

async function main() {
  const [{ data: people, error: peopleError }, { data: categories, error: categoryError }] = await Promise.all([
    db.from('profiles').select('id,full_name,department_id,role').eq('status', 'active').limit(12),
    db.from('idea_categories').select('id,name').eq('is_active', true).is('deleted_at', null).order('sort_order'),
  ]);
  if (peopleError) throw peopleError;
  if (categoryError) throw categoryError;
  if (!people?.length || !categories?.length) throw new Error('Seed active profiles and Idea Hub categories before running this demo seed.');

  for (let index = 0; index < ideas.length; index += 1) {
    const author = people[index % people.length];
    const [ideaTitle, categoryName, status] = ideas[index];
    const title = `${demoMarker} ${ideaTitle}`;
    const statusNote = `${demoMarker} fixture ${index + 1}; safe to retain for Innovation Hub QA.`;
    const category = categories.find(item => item.name === categoryName) || categories[index % categories.length];
    const payload = {
      title,
      problem_or_opportunity: `${demoMarker} ${ideaTitle} addresses a recurring operational gap that employees have raised during daily work and team coordination.`,
      proposed_solution: `${demoMarker} Pilot ${ideaTitle.toLowerCase()} with a simple ownerless process, visible notes, and a monthly review by management.`,
      expected_benefit: 'The team gets a clearer workflow, faster handoffs, and a better employee and customer experience.',
      category_id: category.id,
      submitted_by: author.id,
      submitter_department_id: author.department_id,
      status,
      status_note: statusNote,
      official_response: index === 2 ? 'Management has implemented this idea as a pilot.' : null,
      created_at: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString(),
    };
    const { data: existing, error: existingError } = await db.from('ideas').select('id').eq('status_note', statusNote).maybeSingle();
    if (existingError) throw existingError;
    const query = existing
      ? db.from('ideas').update(payload).eq('id', existing.id)
      : db.from('ideas').insert(payload);
    const { data: idea, error } = await query.select('id,status').single();
    if (error) throw error;

    const supporters = people.filter(person => person.id !== author.id).slice(0, [4, 2, 6, 1, 3, 5, 0, 2][index]);
    if (supporters.length) await db.from('idea_supports').upsert(supporters.map(person => ({ idea_id: idea.id, employee_id: person.id })), { onConflict: 'idea_id,employee_id' });
    const commentCount = [0, 1, 3, 2, 1, 4, 0, 2][index];
    const comments = Array.from({ length: commentCount }, (_, commentIndex) => ({ idea_id: idea.id, author_employee_id: people[(index + commentIndex + 1) % people.length].id, content: `QA demo comment ${commentIndex + 1}: this would be useful for the team.`, is_official_response: false }));
    if (comments.length) await db.from('idea_comments').upsert(comments, { onConflict: 'idea_id,author_employee_id,content' });
  }
  console.log('Idea Hub demo data seeded.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
