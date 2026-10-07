import sharp from 'sharp';
import { profilePhotoSource } from './profile-photo-thumbnail';

const maxSourceBytes = 5 * 1024 * 1024;
const unavailable = (status = 404) => new Response(null, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function profilePhotoThumbnailResponse(request: Request) {
  const source = profilePhotoSource(new URL(request.url).searchParams.get('source') || '');
  if (!source) return unavailable();
  let expiresAt: number;
  try {
    expiresAt = JSON.parse(Buffer.from(source.searchParams.get('token')!.split('.')[1], 'base64url').toString()).exp;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) return unavailable();
  } catch { return unavailable(); }
  try {
    // Storage validates the signed capability on every request. No service key,
    // public CDN cache, or new storage permission is used by this endpoint.
    const original = await fetch(source, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!original.ok || !original.body) { await original.body?.cancel(); return unavailable(); }
    if (Number(original.headers.get('content-length')) > maxSourceBytes) { await original.body.cancel(); return unavailable(413); }
    const reader = original.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxSourceBytes) { await reader.cancel(); return unavailable(413); }
      chunks.push(value);
    }
    const thumbnail = await sharp(Buffer.concat(chunks), { limitInputPixels: 25_000_000 })
      .rotate().resize(96, 96, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    // A browser may cache its own thumbnail, never beyond the original token.
    const maxAge = Math.max(0, Math.min(60, Math.floor(expiresAt - Date.now() / 1000 - 1)));
    return new Response(new Uint8Array(thumbnail), { headers: {
      'Content-Type': 'image/webp', 'Content-Length': String(thumbnail.length),
      'Cache-Control': `private, max-age=${maxAge}, must-revalidate`,
      'Vercel-CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return unavailable(); }
}
