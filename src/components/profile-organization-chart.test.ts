import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = (file:string) => readFileSync(file,'utf8');
describe('organization integration boundaries', () => {
  it('shares one canonical component identified by profile IDs on both profile pages', () => {
    for(const file of ['src/app/employee/profile/page.tsx','src/app/admin/employees/[id]/page.tsx']) {
      expect(source(file)).toContain('<ProfileOrganizationChart profileId={profile.id}');
      expect(source(file)).not.toContain('profileName={profile.full_name}');
    }
  });
  it('uses current private profile photos and initials, never copied chart portraits', () => {
    const repository=source('src/lib/organization-repository.ts');
    expect(repository).toContain('signedProfilePhotoUrl(supabase, person.avatar_url)');
    const component=source('src/components/profile-organization-chart.tsx');
    expect(component).toContain('onError={() => setFailed(true)}');
    expect(component).toContain('employeeAvatarInitials(person.full_name)');
    expect(component).not.toContain('/organization-chart/');
  });
  it('renders the bounded flow and an accessible hierarchy list from the same records', () => {
    const css=source('src/components/profile-organization-chart.css');
    const component=source('src/components/profile-organization-chart.tsx');
    expect(css).toContain('height: 126px');
    expect(css).toContain('overflow: hidden');
    expect(component).toContain('layoutOrganization(structuralPeople, collapsed)');
    expect(component).toContain('OrganizationListBranch');
    expect(component).toContain('nodesDraggable={false}');
    expect(component).toContain('deleteKeyCode={null}');
  });
  it('limits edit controls using per-employee authorization from the server', () => {
    expect(source('src/components/profile-organization-chart.tsx')).toContain('node.can_edit &&');
    expect(source('src/lib/organization-repository.ts')).toContain("rpc('update_organization_employee'");
  });
});
