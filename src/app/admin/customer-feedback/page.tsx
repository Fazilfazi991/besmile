import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase-server';
import { CustomerFeedbackPage } from '@/components/customer-feedback';
export default async function Page(){const db=await serverSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/sign-in');const access=await db.rpc('has_permission',{permission_code:'customer_feedback.view'});if(!access.data)redirect('/unauthorized');return <CustomerFeedbackPage/>;}
