export type AppRole='super_admin'|'chairman'|'director'|'general_manager'|'staff';
export type EmployeeStatus='active'|'inactive'|'on_leave'|'intern'|'probation'|'resigned'|'terminated';
export interface Profile {id:string;full_name:string;email:string;role:AppRole;designation:string|null;department_id:string|null;manager_id:string|null;avatar_url:string|null;status:EmployeeStatus;created_at:string;updated_at:string}
export interface Database {public:{Tables:{profiles:{Row:Profile;Insert:Omit<Profile,'created_at'|'updated_at'>;Update:Partial<Profile>}}}}
