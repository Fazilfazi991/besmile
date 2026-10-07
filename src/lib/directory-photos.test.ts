import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDirectoryPhotoResolver } from './directory-photos';

afterEach(() => vi.useRealTimers());
describe('private directory photo requests', () => {
  it('signs distinct current paths in one batch and reuses unexpired URLs', async () => {
    vi.useFakeTimers();
    const createSignedUrls = vi.fn(async (paths: string[]) => ({ data: paths.map(path => ({path, signedUrl: `signed:${path}`})), error: null }));
    const client = {storage:{from:vi.fn(()=>({createSignedUrls}))}};
    const resolve = createDirectoryPhotoResolver();
    const [first, parallel] = await Promise.all([resolve(client,['a','b','a','']),resolve(client,['a','b'])]);
    expect(first.get('a')).toBe('signed:a');
    expect(parallel.get('b')).toBe('signed:b');
    expect(createSignedUrls).toHaveBeenCalledExactlyOnceWith(['a','b'],300);
    vi.advanceTimersByTime(60_000);
    await resolve(client,['a','b']);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(181_000);
    await resolve(client,['a','b']);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });
  it('drops removed paths and signs replacements instead of reusing an old portrait', async () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({data:paths.map(path=>({path,signedUrl:`signed:${path}`})),error:null}));
    const resolve = createDirectoryPhotoResolver();
    const client={storage:{from:()=>({createSignedUrls})}};
    await resolve(client,['old']);
    expect([...await resolve(client,['new'])]).toEqual([['new','signed:new']]);
    await resolve(client,['old']);
    expect(createSignedUrls).toHaveBeenCalledTimes(3);
  });
  it('keeps a still-valid link during a transient failure, but never returns an expired link', async () => {
    vi.useFakeTimers();
    const createSignedUrls=vi.fn().mockResolvedValueOnce({data:[{path:'a',signedUrl:'valid'}],error:null}).mockRejectedValue(new Error('fetch failed'));
    const resolve=createDirectoryPhotoResolver();const client={storage:{from:()=>({createSignedUrls})}};
    await resolve(client,['a']);
    vi.advanceTimersByTime(241_000);
    expect((await resolve(client,['a'])).get('a')).toBe('valid');
    vi.advanceTimersByTime(60_000);
    expect((await resolve(client,['a'])).get('a')).toBeNull();
  });
  it('handles individual missing objects without losing the other photos', async () => {
    const resolve=createDirectoryPhotoResolver();
    const client={storage:{from:()=>({createSignedUrls:async()=>({data:[{path:'a',signedUrl:'valid'},{path:'b',error:'not found'},{path:'unexpected',signedUrl:'other'}],error:null})})}};
    expect([...await resolve(client,['a','b'])]).toEqual([['a','valid'],['b',null]]);
  });
});
