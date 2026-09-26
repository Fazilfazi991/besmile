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
  it('uses one fitted viewer for chart and both profile photo entry points', () => {
    const chart = source('src/components/profile-organization-chart.tsx');
    const self = source('src/app/employee/profile/page.tsx');
    const detail = source('src/app/admin/employees/[id]/page.tsx');
    const viewer = source('src/components/profile-photo-viewer.tsx');
    const css = source('src/components/profile-photo-viewer.css');
    for (const page of [chart, self, detail]) expect(page).toContain('<ProfilePhotoViewer');
    expect(chart).not.toContain('function PhotoViewer(');
    expect(viewer).toContain('onCancel={event => { event.preventDefault(); onClose(); }}');
    expect(css).toContain('object-fit: contain');
    expect(css).toContain('overflow: hidden');
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
