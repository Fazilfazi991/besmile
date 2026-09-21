import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { signedProfilePhotoUrl } from './profile-photo';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('profile photo refresh', () => {
  it('signs the private stored object without changing storage visibility', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'signed-photo' }, error: null });
    const from = vi.fn(() => ({ createSignedUrl }));

    await expect(signedProfilePhotoUrl({ storage: { from } }, 'user/photo.png')).resolves.toBe('signed-photo');
    expect(from).toHaveBeenCalledWith('profile-photos');
    expect(createSignedUrl).toHaveBeenCalledWith('user/photo.png', 300);
  });

  it('falls back safely when a header photo cannot be signed', async () => {
    const client = { storage: { from: () => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: new Error('denied') }) }) } };
    await expect(signedProfilePhotoUrl(client, 'user/photo.png')).resolves.toBeNull();
  });

  it('refreshes the persistent layout only after successful photo mutations', () => {
    const profilePage = source('src/app/employee/profile/page.tsx');
    expect(profilePage).toContain("await employeeRepository.uploadProfilePhoto(profile.id,file);setNotice('Profile photo updated.');router.refresh();await load()");
    expect(profilePage).toContain("await employeeRepository.removeProfilePhoto(profile.id,profile.avatar_url);setNotice('Profile photo removed.');router.refresh();await load()");
    expect(profilePage).toContain("if(!file)return");
  });

  it('renders the current signed photo in employee and management headers', () => {
    for (const layout of ['src/app/employee/layout.tsx', 'src/app/admin/layout.tsx']) {
      const contents = source(layout);
      expect(contents).toContain('avatar_url');
      expect(contents).toContain('signedProfilePhotoUrl(db, profile.avatar_url)');
      expect(contents).toContain('photoUrl={photoUrl}');
    }
    const header = source('src/components/topbar-profile-link.tsx');
    expect(header).toContain('onError={() => setFailed(true)}');
  });
});
