type SignedPhoto = { url: string; expiresAt: number };

// Each directory read still resolves fresh authorized people from the RPC.
// Reuse only their current photo paths while existing private links are valid.
export function createDirectoryPhotoResolver() {
  const cached = new Map<string, SignedPhoto>();
  let pending: Promise<Map<string, string | null>> | undefined;
  const resolve = async (client: any, paths: string[]): Promise<Map<string, string | null>> => {
    if (pending) { await pending; return resolve(client, paths); }
    const current = [...new Set(paths.filter(Boolean))];
    const now = Date.now();
    const missing = current.filter(path => !cached.has(path) || cached.get(path)!.expiresAt <= now + 60_000);
    for (const path of cached.keys()) if (!current.includes(path)) cached.delete(path);
    const request = async () => {
      if (missing.length) {
        const { data, error } = await client.storage.from('profile-photos').createSignedUrls(missing, 300);
        if (!error) for (const photo of data || []) {
          if (missing.includes(photo.path) && !photo.error && photo.signedUrl) {
            cached.set(photo.path, { url: photo.signedUrl, expiresAt: now + 300_000 });
          }
        }
      }
      return new Map(current.map(path => [path, (cached.get(path)?.expiresAt || 0) > Date.now() ? cached.get(path)!.url : null]));
    };
    pending = request();
    try { return await pending; }
    catch { return new Map(current.map(path => [path, (cached.get(path)?.expiresAt || 0) > Date.now() ? cached.get(path)!.url : null])); }
    finally { pending = undefined; }
  };
  return resolve;
}
