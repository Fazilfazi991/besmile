import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHOTO_UNREADABLE, PHOTO_UNSUPPORTED, validateClinicianPhoto } from './clinician-photo-rules';
const jpeg = new Uint8Array([255,216,255,224,0,16]);
const png = new Uint8Array([137,80,78,71,13,10,26,10]);
const webp = new TextEncoder().encode('RIFF0000WEBPVP8 ');
afterEach(() => vi.unstubAllGlobals());
describe('profile photo validation', () => {
  it.each([['photo.jpg','image/jpeg',jpeg],['photo.jpeg','image/jpeg',jpeg],['PHOTO.JPG','image/jpg',jpeg],['photo.png','image/png',png],['photo.webp','image/webp',webp],['photo.jpeg','',jpeg]])('accepts %s / %s only when content matches', async (name, type, content) => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width:1, height:1, close:vi.fn() }));
    expect((await validateClinicianPhoto(new File([content], name, { type }))).contentType).toBe(type === '' || type === 'image/jpg' ? 'image/jpeg' : type);
  });
  it('rejects oversize, unsupported, empty, renamed and mismatched files separately', async () => {
    await expect(validateClinicianPhoto(new File([new Uint8Array(5*1024*1024+1)],'photo.jpg',{type:'image/jpeg'}))).rejects.toThrow('Profile photo must be 5 MB or smaller.');
    await expect(validateClinicianPhoto(new File(['abc'],'photo.gif',{type:'image/gif'}))).rejects.toThrow(PHOTO_UNSUPPORTED);
    await expect(validateClinicianPhoto(new File([],'photo.jpg',{type:'image/jpeg'}))).rejects.toThrow(PHOTO_UNREADABLE);
    await expect(validateClinicianPhoto(new File(['<script>bad</script>'],'photo.jpg'))).rejects.toThrow(PHOTO_UNREADABLE);
    await expect(validateClinicianPhoto(new File([png],'photo.jpg',{type:'image/jpeg'}))).rejects.toThrow(PHOTO_UNREADABLE);
  });
  it('rejects signature-correct corruption when browser decoding fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decoder internals')));
    await expect(validateClinicianPhoto(new File([jpeg],'photo.jpeg',{type:'image/jpeg'}))).rejects.toThrow(PHOTO_UNREADABLE);
  });
});
