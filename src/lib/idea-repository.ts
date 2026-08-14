import { supabase } from './supabase';
import { validateIdeaComment, type IdeaPriority, type IdeaStatus } from './idea-rules';

const db=()=>{ if(!supabase) throw new Error('Supabase is not configured.'); return supabase; };
export type InnovationFilters={search?:string;status?:string;category?:string;priority?:string;owner?:string;submitter?:string;from?:string;to?:string};
const clean=(value:string)=>value.trim().replace(/<[^>]*>/g,'');

export const ideaRepository={
  async permissions(){
    const codes=['innovation.view_self','innovation.create','innovation.view_all','innovation.review','innovation.manage'];
    const results=await Promise.all(codes.map(permission_code=>db().rpc('has_permission',{permission_code})));
    results.forEach(result=>{if(result.error) throw result.error;});
    return new Set(codes.filter((_,index)=>results[index].data===true));
  },
  async categories(includeInactive=false){
    let query=db().from('idea_categories').select('id,name,description,sort_order,is_active').is('deleted_at',null).order('sort_order').order('name');
    if(!includeInactive) query=query.eq('is_active',true);
    const {data,error}=await query; if(error) throw error; return data||[];
  },
  async feed(filters:InnovationFilters={}){
    let query=db().from('ideas').select('id,title,problem_or_opportunity,proposed_solution,expected_benefit,status,priority,owner_id,submitted_by,target_date,progress_percent,created_at,updated_at,category:idea_categories(id,name),submitter:profiles!ideas_submitted_by_fkey(id,full_name),owner:profiles!ideas_owner_id_fkey(id,full_name)').order('created_at',{ascending:false}).limit(50);
    if(filters.status) query=query.eq('status',filters.status); if(filters.category) query=query.eq('category_id',filters.category); if(filters.priority) query=query.eq('priority',filters.priority); if(filters.owner) query=query.eq('owner_id',filters.owner); if(filters.submitter) query=query.eq('submitted_by',filters.submitter); if(filters.from) query=query.gte('created_at',`${filters.from}T00:00:00`); if(filters.to) query=query.lte('created_at',`${filters.to}T23:59:59`);
    if(filters.search?.trim()){ const term=filters.search.trim().replace(/[%_,()]/g,' ').slice(0,80); query=query.or(`title.ilike.%${term}%,problem_or_opportunity.ilike.%${term}%,proposed_solution.ilike.%${term}%`); }
    const {data,error}=await query; if(error) throw error; return data||[];
  },
  async summary(){ const {data,error}=await db().rpc('innovation_summary'); if(error) throw error; return Object.fromEntries((data||[]).map((row:any)=>[row.status,Number(row.total)])); },
  async detail(id:string){
    const [idea,comments,history,attachments]=await Promise.all([
      db().from('ideas').select('*,category:idea_categories(id,name),submitter:profiles!ideas_submitted_by_fkey(id,full_name,designation),owner:profiles!ideas_owner_id_fkey(id,full_name),reviewer:profiles!ideas_reviewer_id_fkey(id,full_name),implementer:profiles!ideas_implemented_by_fkey(id,full_name),task:tasks!ideas_linked_task_id_fkey(id,title)').eq('id',id).single(),
      db().from('idea_comments').select('*,author:profiles!idea_comments_author_employee_id_fkey(id,full_name)').eq('idea_id',id).order('created_at'),
      db().from('idea_status_history').select('*,actor:profiles!idea_status_history_changed_by_fkey(id,full_name)').eq('idea_id',id).order('created_at',{ascending:false}).limit(100),
      db().from('idea_attachments').select('*').eq('idea_id',id).is('deleted_at',null).order('created_at'),
    ]);
    for(const result of [idea,comments,history,attachments]) if(result.error) throw result.error;
    return {idea:idea.data,comments:comments.data||[],history:history.data||[],attachments:attachments.data||[]};
  },
  async people(){ const {data,error}=await db().from('profiles').select('id,full_name,status,is_employee,workforce_visible').eq('status','active').eq('is_employee',true).eq('workforce_visible',true).order('full_name').limit(300); if(error) throw error; return data||[]; },
  async tasks(){ const {data,error}=await db().from('tasks').select('id,title,status').order('created_at',{ascending:false}).limit(100); if(error) throw error; return data||[]; },
  async addReviewNote(ideaId:string,content:string,profileId:string,visible=true){ const message=validateIdeaComment(content); if(message) throw new Error(message); const {error}=await db().from('idea_comments').insert({idea_id:ideaId,author_employee_id:profileId,content:clean(content),is_official_response:true,is_visible_to_submitter:visible}); if(error) throw error; },
  async transition(input:{id:string;expectedStatus:IdeaStatus;nextStatus:IdeaStatus;priority?:IdeaPriority;ownerId?:string;targetDate?:string;progress?:number;decisionNote?:string;implementationNote?:string;taskId?:string}){
    const {data,error}=await db().rpc('innovation_transition',{target:input.id,expected_status:input.expectedStatus,next_status:input.nextStatus,next_priority:input.priority||null,next_owner:input.ownerId||null,next_target_date:input.targetDate||null,next_progress:input.progress??null,decision_note:input.decisionNote||null,implementation_text:input.implementationNote||null,task_link:input.taskId||null,request_key:crypto.randomUUID()}); if(error) throw error; return data;
  },
  async openAttachment(ideaId:string,attachmentId:string){ const response=await fetch(`/api/ideas/${ideaId}/attachments/${attachmentId}/signed-url`); const body=await response.json(); if(!response.ok) throw new Error(body.error||'Attachment unavailable.'); window.open(body.url,'_blank','noopener,noreferrer'); },
};
