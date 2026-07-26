import {supabase} from './supabase';
export async function signIn(email:string,password:string){if(!supabase)throw new Error('Supabase is not configured.');const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;return data;}
export async function signOut(){if(!supabase)return;const {error}=await supabase.auth.signOut();if(error)throw error;}
export async function currentProfile(){if(!supabase)return null;const {data:{user}}=await supabase.auth.getUser();if(!user)return null;const {data,error}=await supabase.from('profiles').select('*').eq('id',user.id).single();if(error)throw error;return data;}
