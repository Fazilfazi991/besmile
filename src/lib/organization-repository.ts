import { supabase } from './supabase';
import { signedProfilePhotoUrl } from './profile-photo';
import { type OrganizationEmployee } from './organization-chart-config';

export const organizationChangedEvent = 'bsmile:organization-changed';
export function notifyOrganizationChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(organizationChangedEvent));
}
export const organizationRepository = {
  async employees(): Promise<OrganizationEmployee[]> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('organization_directory');
    if (error) throw error;
    return data || [];
  },
  async directory(): Promise<OrganizationEmployee[]> {
    const people = await this.employees();
    return Promise.all(people.map(async person => ({
      ...person,
      photo_url: await signedProfilePhotoUrl(supabase, person.avatar_url).catch(() => null),
    })));
  },
  async departments(): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await supabase.from('departments').select('id,name').eq('is_active', true).order('name');
    if (error) throw error;
    return data || [];
  },
  async createDepartment(name: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_employee_department', { department_name: name.trim() });
    if (error) throw error;
    return data;
  },
  async update(id: string, patch: { manager_id: string | null; department_id: string | null; designation: string }) {
    const { error } = await supabase.rpc('update_organization_employee', {
      employee_id: id, reporting_manager_id: patch.manager_id,
      employee_department_id: patch.department_id, employee_designation: patch.designation.trim(),
    });
    if (error) throw error;
    notifyOrganizationChanged();
  },
};
