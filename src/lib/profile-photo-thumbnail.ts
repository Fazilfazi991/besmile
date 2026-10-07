// Only proxy existing, private, signed profile photos from this Supabase project.
export function profilePhotoSource(source: string, projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    if (!projectUrl || source.length > 4096) return null;
    const url = new URL(source);
    const project = new URL(projectUrl);
    if (url.origin !== project.origin || url.username || url.password || url.hash) return null;
    if (!/^https?:$/.test(url.protocol)) return null;
    const prefix = '/storage/v1/object/sign/profile-photos/';
    if (!url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!/^[a-f0-9-]{36}\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(path)) return null;
    const token = url.searchParams.get('token');
    if (!token || !/^[A-Za-z0-9_.-]+$/.test(token)) return null;
    return url;
  } catch { return null; }
}

export function profilePhotoThumbnailUrl(source: string, retry = false) {
  return profilePhotoSource(source)
    ? `/api/profile-photo/thumbnail?source=${encodeURIComponent(source)}${retry ? '&retry=1' : ''}`
    : source;
}
