import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { profilePhotoSource, profilePhotoThumbnailUrl } from './profile-photo-thumbnail';
import { profilePhotoThumbnailResponse } from './profile-photo-thumbnails';

const project='https://example.supabase.co';
const path='/storage/v1/object/sign/profile-photos/4096a95f-970b-4542-8f18-cf5dd6a66150/photo.jpg';
const signed=(expires:number)=>`${project}${path}?token=x.${Buffer.from(JSON.stringify({exp:expires})).toString('base64url')}.x`;
const request=(source:string)=>new Request(`https://bsmile.example/api/profile-photo/thumbnail?source=${encodeURIComponent(source)}`);
beforeEach(()=>vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL',project));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('private profile thumbnails',()=>{
  it('rejects foreign hosts, other buckets, redirects, credentials and traversal before fetching',async()=>{
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    for(const source of [signed(Date.now()/1000+300).replace(project,'https://attacker.example'),signed(1).replace('profile-photos','patient-documents'),`${project}/storage/v1/object/sign/profile-photos/../other.jpg?token=x.x.x`,signed(1).replace('https://','https://user:password@')]) {
      expect(profilePhotoSource(source)).toBeNull();
      expect((await profilePhotoThumbnailResponse(request(source))).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires Storage to validate the existing signed token and does not cache a denial',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:403}));vi.stubGlobal('fetch',fetchMock);
    const response=await profilePhotoThumbnailResponse(request(signed(Date.now()/1000+300)));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({cache:'no-store',redirect:'error'});
  });
  it('does not fetch expired links',async()=>{
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    expect((await profilePhotoThumbnailResponse(request(signed(1)))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns a small 96px WebP and keeps caching private and inside token expiry',async()=>{
    const original=await sharp({create:{width:1800,height:1200,channels:3,background:'#557788'}}).png().toBuffer();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array(original))));
    const response=await profilePhotoThumbnailResponse(request(signed(Math.floor(Date.now()/1000)+30)));
    const result=Buffer.from(await response.arrayBuffer());const info=await sharp(result).metadata();
    expect(response.status).toBe(200);
    expect(info).toMatchObject({width:96,height:96,format:'webp'});
    expect(result.length).toBeLessThan(original.length/4);
    expect(response.headers.get('cache-control')).toMatch(/^private, max-age=(?:[0-2]?\d), must-revalidate$/);
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(profilePhotoThumbnailUrl(signed(9999999999))).toContain('/api/profile-photo/thumbnail?source=');
    expect(profilePhotoThumbnailUrl(signed(9999999999), true)).toContain('&retry=1');
  });
  it('bounds source size and rejects invalid image data',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('too large',{headers:{'content-length':String(6*1024*1024)}})).mockResolvedValueOnce(new Response('not an image')));
    const source=signed(Date.now()/1000+300);
    expect((await profilePhotoThumbnailResponse(request(source))).status).toBe(413);
    expect((await profilePhotoThumbnailResponse(request(source))).status).toBe(404);
  });
});
