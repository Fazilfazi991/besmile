import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase-server';
import { CustomerFeedbackPage } from '@/components/customer-feedback';
import { serverAuthorizationRead, serverPermissionRead } from '@/lib/server-authorization-read';
export default async function Page(){const db=await serverSupabase();const {data:{user}}=await serverAuthorizationRead(()=>db.auth.getUser(),'feedback.session',true);if(!user)redirect('/sign-in');const access=await serverPermissionRead(signal=>db.rpc('has_permission',{permission_code:'customer_feedback.view'}).abortSignal(signal),'feedback.permission');if(!access.data)redirect('/unauthorized');return <CustomerFeedbackPage/>;}
