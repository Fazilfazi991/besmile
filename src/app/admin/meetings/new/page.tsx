import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase-server';

export default async function Page(){
  const db=await serverSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/sign-in');
  const permission=await db.rpc('has_permission',{permission_code:'meetings.create'});if(!permission.data)redirect('/unauthorized');
  redirect('/admin/meetings');
}
