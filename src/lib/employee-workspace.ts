import {currentProfile} from './auth';
import {employeeRepository} from './employee-repository';
export async function loadEmployeeWorkspace(){const profile=await currentProfile() as {id:string;full_name:string}|null;if(!profile)throw new Error('Please sign in to view your workspace.');const data=await employeeRepository.dashboard(profile.id);return {profile,data};}
