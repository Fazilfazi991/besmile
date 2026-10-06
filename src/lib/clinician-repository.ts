import { supabase } from './supabase';
export async function clinicianRpc<T = any>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const result = await (supabase as any).rpc(name, args);
  if (result.error) throw result.error;
  return result.data as T;
}
export const clinicianRepository = {
  schedule: () => clinicianRpc('clinician_schedule'),
  clients: (slug?: string) => clinicianRpc<any[]>('clinician_clients', { target_slug: slug || null }),
  sessions: (patient: string) => clinicianRpc<any[]>('clinician_sessions', { target_patient: patient }),
  profile: (doctor?: string) => clinicianRpc('clinician_profile', { target_doctor: doctor || null }),
  saveProfile: (doctor: string, patch: Record<string, unknown>) => clinicianRpc('save_clinician_profile', { target_doctor: doctor, patch }),
  followups: (patient?: string) => clinicianRpc<any[]>('operational_clinical_followups', { target_patient: patient || null }),
  async photo(profileId: string, file: File) {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)
      throw new Error('Choose a JPG, PNG or WebP photo up to 5 MB.');
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    const path = `${profileId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('profile-photos').upload(path, file, { contentType: file.type });
    if (error) throw error;
    return path;
  },
  async photoUrl(path?: string | null) {
    if (!supabase || !path) return null;
    const { data, error } = await supabase.storage.from('profile-photos').createSignedUrl(path, 300);
    return error ? null : data.signedUrl;
  },
};
