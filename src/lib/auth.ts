import {supabase} from './supabase';
import { isDemoMode } from './demo-mode';
import { demoUser } from '@/demo/demo-data';
export async function signIn(email:string,password:string){if(!supabase)throw new Error('Supabase is not configured.');const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;return data;}
export async function signOut(){if(!supabase)return;const {error}=await supabase.auth.signOut();if(error)throw error;}
export async function currentProfile(){if(isDemoMode())return demoUser;if(!supabase)return null;const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw new Error('Unable to verify your session. Please try again.');if(!user)return null;const {data,error}=await supabase.from('profiles').select('*').eq('id',user.id).maybeSingle();if(error)throw new Error('Your profile could not be loaded. Please try again.');return data;}
