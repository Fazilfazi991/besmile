import { supabase } from './supabase';
import { ideaAttachmentKey, ideaStorage, IDEA_ATTACHMENTS_BUCKET } from './storage/storage-service';
import { safeIdeaFilename, validateIdeaAttachment, validateIdeaComment, validateIdeaPayload, validateIdeaStatusChange, type IdeaStatus } from './idea-rules';

const db = () => {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
};

export type IdeaPayload = {
  title: string;
  problem_or_opportunity: string;
  proposed_solution: string;
  expected_benefit: string;
  category_id: string;
};

const clean = (value: string) => value.trim().replace(/<[^>]*>/g, '');
const ext = (name: string) => name.toLowerCase().split('.').filter(Boolean).at(-1) || '';

async function checksum(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hasPermission(permission: string) {
  const { data, error } = await db().rpc('has_permission', { permission_code: permission });
  if (error) throw error;
  return data === true;
}

export const ideaRepository = {
  async categories(includeInactive = false) {
    let query = db().from('idea_categories').select('*,ideas(count)').is('deleted_at', null).order('sort_order').order('name');
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async feed() {
    const { data, error } = await db().from('ideas')
      .select('*,category:idea_categories(id,name),submitter:profiles!ideas_submitted_by_fkey(id,full_name,avatar_url,designation,department:departments(name)),supports:idea_supports(id,employee_id),comments:idea_comments(id,is_deleted)')
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    return data || [];
  },

  async detail(id: string) {
    const [idea, comments, history, activity, attachments] = await Promise.all([
      db().from('ideas').select('*,category:idea_categories(id,name),submitter:profiles!ideas_submitted_by_fkey(id,full_name,avatar_url,designation,department:departments(name)),supports:idea_supports(id,employee_id)').eq('id', id).single(),
      db().from('idea_comments').select('*,author:profiles!idea_comments_author_employee_id_fkey(id,full_name,avatar_url,designation)').eq('idea_id', id).order('created_at'),
      db().from('idea_status_history').select('*,actor:profiles!idea_status_history_changed_by_fkey(full_name)').eq('idea_id', id).order('created_at', { ascending: false }),
      db().from('idea_activity_logs').select('*,actor:profiles!idea_activity_logs_actor_employee_id_fkey(full_name)').eq('idea_id', id).order('created_at', { ascending: false }).limit(40),
      db().from('idea_attachments').select('*').eq('idea_id', id).is('deleted_at', null).order('created_at'),
    ]);
    for (const result of [idea, comments, history, activity, attachments]) if (result.error) throw result.error;
    return { idea: idea.data, comments: comments.data || [], history: history.data || [], activity: activity.data || [], attachments: attachments.data || [] };
  },

  async stats() {
    const rows = await this.feed();
    const month = new Date().toISOString().slice(0, 7);
    return {
      total: rows.length,
      submitted: rows.filter((item: any) => item.status === 'Submitted').length,
      consideration: rows.filter((item: any) => item.status === 'Under Consideration').length,
      implemented: rows.filter((item: any) => item.status === 'Implemented').length,
      hold: rows.filter((item: any) => item.status === 'On Hold').length,
      notProceeding: rows.filter((item: any) => item.status === 'Not Proceeding').length,
      archived: rows.filter((item: any) => item.status === 'Archived').length,
      supports: rows.reduce((sum: number, item: any) => sum + (item.supports?.length || 0), 0),
      comments: rows.reduce((sum: number, item: any) => sum + (item.comments?.filter((comment: any) => !comment.is_deleted).length || 0), 0),
      thisMonth: rows.filter((item: any) => String(item.created_at).startsWith(month)).length,
    };
  },

  async createIdea(profile: any, payload: IdeaPayload, file?: File | null) {
    const message = validateIdeaPayload(payload);
    if (message) throw new Error(message);
    const { data: category, error: categoryError } = await db().from('idea_categories').select('id').eq('id', payload.category_id).eq('is_active', true).is('deleted_at', null).maybeSingle();
    if (categoryError) throw categoryError;
    if (!category) throw new Error('Choose an active Innovation Hub category.');
    const { data, error } = await db().from('ideas').insert({
      title: clean(payload.title),
      problem_or_opportunity: clean(payload.problem_or_opportunity),
      proposed_solution: clean(payload.proposed_solution),
      expected_benefit: clean(payload.expected_benefit),
      category_id: payload.category_id,
      submitted_by: profile.id,
      submitter_department_id: profile.department_id || null,
      status: 'Submitted',
    }).select('id').single();
    if (error) throw error;
    if (file) await this.uploadAttachment(data.id, profile.id, file);
    return data;
  },

  async updateIdea(id: string, payload: IdeaPayload) {
    const message = validateIdeaPayload(payload);
    if (message) throw new Error(message);
    const { error } = await db().from('ideas').update({
      title: clean(payload.title),
      problem_or_opportunity: clean(payload.problem_or_opportunity),
      proposed_solution: clean(payload.proposed_solution),
      expected_benefit: clean(payload.expected_benefit),
      category_id: payload.category_id,
    }).eq('id', id);
    if (error) throw error;
  },

  async toggleSupport(idea: any, profileId: string) {
    const supported = idea.supports?.some((support: any) => support.employee_id === profileId);
    if (supported) {
      const { error } = await db().from('idea_supports').delete().eq('idea_id', idea.id).eq('employee_id', profileId);
      if (error) throw error;
      return false;
    }
    const { error } = await db().from('idea_supports').insert({ idea_id: idea.id, employee_id: profileId });
    if (error) throw new Error(error.code === '23505' ? 'You already liked this idea.' : error.message);
    return true;
  },

  async addComment(ideaId: string, profileId: string, content: string, parentId?: string | null, official = false) {
    const message = validateIdeaComment(content);
    if (message) throw new Error(message);
    if (official && !await hasPermission('ideas.manage_status')) throw new Error('You do not have permission to add an official response.');
    const text = clean(content);
    const { data, error } = await db().from('idea_comments').insert({ idea_id: ideaId, author_employee_id: profileId, parent_comment_id: parentId || null, content: text, is_official_response: official }).select('id').single();
    if (error) throw error;
    await this.notifyMentions(ideaId, profileId, text, data.id);
  },

  async notifyMentions(ideaId: string, profileId: string, content: string, commentId: string) {
    const mentionText = content.toLowerCase();
    if (!mentionText.includes('@')) return;
    const { data: people, error } = await db().from('profiles').select('id,full_name').eq('status', 'active');
    if (error) throw error;
    const recipients = (people || []).filter((person: any) => person.id !== profileId && person.full_name && mentionText.includes(`@${String(person.full_name).toLowerCase()}`));
    await Promise.all([...new Map(recipients.map((person: any) => [person.id, person])).values()].map((person: any) => db().rpc('notify_user', {
      target: person.id,
      heading: 'You were mentioned in Innovation Hub',
      message: 'A colleague mentioned you in an Innovation Hub comment.',
      kind: 'idea_mention',
      entity: ideaId,
      link: `/employee/ideas/${ideaId}`,
      sender: profileId,
    })));
    if (recipients.length) await db().from('idea_activity_logs').insert({ idea_id: ideaId, action_type: 'mention_added', actor_employee_id: profileId, metadata: { comment_id: commentId, mentioned_profile_ids: recipients.map((person: any) => person.id) } });
  },

  async editComment(id: string, content: string) {
    const message = validateIdeaComment(content);
    if (message) throw new Error(message);
    const { error } = await db().from('idea_comments').update({ content: clean(content) }).eq('id', id);
    if (error) throw error;
  },

  async deleteComment(id: string, profileId: string) {
    const { error } = await db().from('idea_comments').update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: profileId }).eq('id', id);
    if (error) throw error;
  },

  async changeStatus(id: string, status: IdeaStatus, note: string, officialResponse = '') {
    const message = validateIdeaStatusChange(status, note);
    if (message) throw new Error(message);
    const patch: Record<string, unknown> = { status, status_note: clean(note) || null };
    if (officialResponse.trim()) patch.official_response = clean(officialResponse);
    if (status === 'Archived') patch.archived_at = new Date().toISOString();
    const { error } = await db().from('ideas').update(patch).eq('id', id);
    if (error) throw error;
  },

  async saveCategory(payload: { id?: string; name: string; description?: string; sort_order: number; is_active: boolean; actorId: string }) {
    const name = clean(payload.name);
    if (name.length < 2) throw new Error('Category name is required.');
    const row = { name, description: clean(payload.description || '') || null, sort_order: payload.sort_order, is_active: payload.is_active };
    const result = payload.id
      ? await db().from('idea_categories').update(row).eq('id', payload.id)
      : await db().from('idea_categories').insert({ ...row, created_by: payload.actorId });
    if (result.error) throw result.error;
    await db().from('idea_activity_logs').insert({ action_type: payload.id ? 'category_edited' : 'category_created', actor_employee_id: payload.actorId, metadata: { name } });
  },

  async uploadAttachment(ideaId: string, profileId: string, file: File) {
    const message = validateIdeaAttachment(file);
    if (message) throw new Error(message);
    const pendingKey = `pending-${crypto.randomUUID()}`;
    const extension = ext(file.name);
    const { data, error } = await db().from('idea_attachments').insert({
      idea_id: ideaId,
      uploaded_by: profileId,
      original_file_name: safeIdeaFilename(file.name),
      storage_key: pendingKey,
      mime_type: file.type,
      file_extension: extension,
      file_size: file.size,
    }).select('id').single();
    if (error) throw error;
    const key = ideaAttachmentKey(ideaId, data.id, extension);
    try {
      await ideaStorage(db()).uploadFile({ bucket: IDEA_ATTACHMENTS_BUCKET, storageKey: key, file, contentType: file.type });
      const { error: updateError } = await db().from('idea_attachments').update({ storage_key: key, checksum: await checksum(file) }).eq('id', data.id);
      if (updateError) throw updateError;
    } catch (error) {
      await db().from('idea_attachments').update({ deleted_at: new Date().toISOString(), deleted_by: profileId }).eq('id', data.id);
      throw error;
    }
  },
};
