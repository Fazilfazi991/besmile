import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;const session=await serverSupabase();const {data:{user}}=await session.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const permission=await session.rpc('has_permission',{permission_code:'onboarding.activate'});if(!permission.data)return NextResponse.json({error:'Permission denied'},{status:403});
 const {data:item,error}=await session.from('employee_onboardings').select('id,personal_email,employee_id,stage').eq('id',id).maybeSingle();if(error||!item)return NextResponse.json({error:'Onboarding not found.'},{status:404});
 if(item.employee_id)return NextResponse.json({employeeId:item.employee_id,alreadyActivated:true});
 const body=await request.json().catch(()=>({}));const role=String(body.role||'staff');
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
 const existing=await admin.from('profiles').select('id').ilike('email',item.personal_email).maybeSingle();if(existing.data)return NextResponse.json({error:'An employee with this email already exists.'},{status:409});
 const invitation=await admin.auth.admin.inviteUserByEmail(item.personal_email);if(invitation.error||!invitation.data.user)return NextResponse.json({error:invitation.error?.message||'Employee invitation could not be created.'},{status:400});
 const activated=await session.rpc('activate_onboarding_employee',{target_onboarding:id,target_user:invitation.data.user.id,target_role:role});
 if(activated.error){await admin.auth.admin.deleteUser(invitation.data.user.id);return NextResponse.json({error:activated.error.message},{status:409})}
 return NextResponse.json({employeeId:activated.data.employee_id,employeeCode:activated.data.employee_code||null,alreadyActivated:false});
}
