export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_UNREADABLE = 'The selected image could not be read. Choose another photo.';
export const PHOTO_UNSUPPORTED = 'Use a JPG, JPEG, PNG or WebP image.';
export const PHOTO_UNLINKED = 'Create/link the clinician account before uploading a profile photo.';

/** MIME, extension and content must agree; a filename alone never authorizes upload. */
export async function validateClinicianPhoto(file: File) {
  if (!(file instanceof File) || !file.size) throw new Error(PHOTO_UNREADABLE);
  if (file.size > PROFILE_PHOTO_MAX_BYTES) throw new Error('Profile photo must be 5 MB or smaller.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  const expected = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : null;
  const mime = file.type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.type.toLowerCase();
  if (!expected || (mime && mime !== expected)) throw new Error(PHOTO_UNSUPPORTED);
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer()); } catch { throw new Error(PHOTO_UNREADABLE); }
  const signature = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
    : [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte) ? 'image/png'
    : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp' : null;
  if (!signature || signature !== expected) throw new Error(PHOTO_UNREADABLE);
  // Decode in the browser as well: correct magic bytes can still hide corruption.
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      const readable = bitmap.width > 0 && bitmap.height > 0;
      bitmap.close();
      if (!readable) throw new Error(PHOTO_UNREADABLE);
    } else if (typeof window !== 'undefined') {
      const url = URL.createObjectURL(file);
      try { const image = new window.Image(); image.src = url; await image.decode(); if (!image.naturalWidth || !image.naturalHeight) throw new Error(PHOTO_UNREADABLE); }
      finally { URL.revokeObjectURL(url); }
    }
  } catch { throw new Error(PHOTO_UNREADABLE); }
  return { contentType: expected, extension: expected === 'image/jpeg' ? 'jpg' : extension! };
}
