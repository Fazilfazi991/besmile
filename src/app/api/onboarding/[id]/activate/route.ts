import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;const session=await serverSupabase();const {data:{user}}=await session.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const permission=await session.rpc('has_permission',{permission_code:'onboarding.activate'});if(!permission.data)return NextResponse.json({error:'Permission denied'},{status:403});
 const body=await request.json().catch(()=>({}));const role=String(body.role||'staff');
 const started=await session.rpc('begin_onboarding_activation',{target_onboarding:id});if(started.error)return NextResponse.json({error:started.error.message},{status:409});const item=started.data;
 if(item.employee_id)return NextResponse.json({employeeId:item.employee_id,alreadyActivated:true});
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
 const fail=async(message:string)=>{await session.rpc('mark_onboarding_activation_failed',{target_onboarding:id,failure_reason:message});return NextResponse.json({error:message},{status:409})};
 const existing=await admin.from('profiles').select('id').ilike('email',item.personal_email).maybeSingle();if(existing.data)return fail('An employee with this email already exists.');
 let invitedUserId=item.invited_user_id as string|undefined;
 if(!invitedUserId){const invitation=await admin.auth.admin.inviteUserByEmail(item.personal_email);if(invitation.error||!invitation.data.user)return fail(invitation.error?.message||'Employee invitation could not be created.');invitedUserId=invitation.data.user.id;const recorded=await session.rpc('record_onboarding_invitation',{target_onboarding:id,target_user:invitedUserId});if(recorded.error){await admin.auth.admin.deleteUser(invitedUserId);return fail(recorded.error.message)}}
 const activated=await session.rpc('activate_onboarding_employee',{target_onboarding:id,target_user:invitedUserId,target_role:role});
 if(activated.error)return fail(activated.error.message);
 return NextResponse.json({employeeId:activated.data.employee_id,employeeCode:activated.data.employee_code||null,alreadyActivated:false});
}
