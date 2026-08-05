import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding Idea Hub demo data.');

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const titles = [
  'Introduce a Monthly Staff Knowledge-Sharing Session',
  'Improve Patient Follow-Up Reminder Process',
  'Create a Standard New Employee Welcome Kit',
  'Reduce Repeated Manual Data Entry',
  'Add a Quiet Focus Area in the Office',
  'Create a Customer Feedback Review Meeting',
  'Improve Internal Training Material',
  'Introduce a Monthly Employee Recognition Activity',
];
const statuses = ['Submitted', 'Under Consideration', 'Implemented', 'On Hold', 'Not Proceeding', 'Submitted', 'Under Consideration', 'Implemented'];

async function main() {
  const [{ data: people, error: peopleError }, { data: categories, error: categoryError }] = await Promise.all([
    db.from('profiles').select('id,full_name,department_id,role').eq('status', 'active').limit(12),
    db.from('idea_categories').select('id,name').eq('is_active', true).is('deleted_at', null).order('sort_order'),
  ]);
  if (peopleError) throw peopleError;
  if (categoryError) throw categoryError;
  if (!people?.length || !categories?.length) throw new Error('Seed active profiles and Idea Hub categories before running this demo seed.');

  for (let index = 0; index < titles.length; index += 1) {
    const author = people[index % people.length];
    const category = categories[index % categories.length];
    const title = titles[index];
    const { data: idea, error } = await db.from('ideas').upsert({
      title,
      problem_or_opportunity: `${title} addresses a recurring operational gap that employees have raised during daily work and team coordination.`,
      proposed_solution: `Pilot ${title.toLowerCase()} with a simple ownerless process, visible notes, and a monthly review by management.`,
      expected_benefit: 'The team gets a clearer workflow, faster handoffs, and a better employee and customer experience.',
      category_id: category.id,
      submitted_by: author.id,
      submitter_department_id: author.department_id,
      status: statuses[index],
      status_note: statuses[index] === 'Not Proceeding' ? 'Kept for future review after current priorities.' : null,
      official_response: index === 2 ? 'Management has implemented this idea as a pilot.' : null,
    }, { onConflict: 'title' }).select('id,status').single();
    if (error) throw error;

    const supporters = people.filter(person => person.id !== author.id).slice(0, (index % 5) + 1);
    if (supporters.length) await db.from('idea_supports').upsert(supporters.map(person => ({ idea_id: idea.id, employee_id: person.id })), { onConflict: 'idea_id,employee_id' });
    await db.from('idea_comments').upsert([
      { idea_id: idea.id, author_employee_id: supporters[0]?.id || author.id, content: 'This would be useful for the team.', is_official_response: false },
      { idea_id: idea.id, author_employee_id: people.find(person => ['general_manager', 'director', 'chairman', 'super_admin'].includes(person.role))?.id || author.id, content: 'Thank you for sharing this idea. We will review the practical next step.', is_official_response: true },
    ], { onConflict: 'idea_id,author_employee_id,content' });
  }

  const { data: firstIdea } = await db.from('ideas').select('id,submitted_by').eq('title', titles[0]).single();
  if (firstIdea) {
    await db.from('idea_attachments').upsert({
      idea_id: firstIdea.id,
      uploaded_by: firstIdea.submitted_by,
      original_file_name: 'demo-idea-attachment.pdf',
      storage_key: `demo/idea-hub/${firstIdea.id}/demo-idea-attachment.pdf`,
      mime_type: 'application/pdf',
      file_extension: 'pdf',
      file_size: 1024,
      checksum: 'demo',
    }, { onConflict: 'storage_key' });
  }
  console.log('Idea Hub demo data seeded.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
