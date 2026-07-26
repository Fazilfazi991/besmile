import {supabase} from './supabase';
import type {Profile} from '@/types/database';
export type Employee=Pick<Profile,'id'|'full_name'|'email'|'role'|'designation'|'manager_id'|'status'>;
export async function getEmployees():Promise<Employee[]> { if(!supabase) return []; const {data,error}=await supabase.from('profiles').select('id,full_name,email,role,designation,manager_id,status').order('full_name'); if(error) throw error; return data as Employee[]; }
