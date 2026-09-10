import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authorizationRead, AuthorizationUnavailable, isTransientAuthorizationError, withAuthorizationTransportRetry } from './authorization-transport';

const mock = vi.hoisted(() => ({auth:vi.fn(),profile:vi.fn(),permission:vi.fn()}));
vi.mock('@supabase/ssr', () => ({createServerClient: () => ({
  auth:{getUser:mock.auth},
  from:() => ({select:() => ({eq:() => ({abortSignal:() => ({maybeSingle:mock.profile})})})}),
  rpc:(_name: string,args: {permission_code:string}) => ({abortSignal:() => mock.permission(args.permission_code)}),
})}));
import { middleware } from '../middleware';
const reset = {message:'fetch failed',code:'ECONNRESET'};
beforeEach(() => {
  vi.useFakeTimers();
  mock.auth.mockReset().mockResolvedValue({data:{user:{id:'qa-employee'}},error:null});
  mock.profile.mockReset().mockResolvedValue({data:{role:'staff',status:'active',is_employee:true},error:null});
  mock.permission.mockReset().mockResolvedValue({data:false,error:null});
  vi.spyOn(console,'warn').mockImplementation(() => {});
});
afterEach(() => {vi.useRealTimers();vi.restoreAllMocks();});
async function request() {
  const result = middleware(new NextRequest('http://localhost/employee/daily-work'));
  await vi.runAllTimersAsync();
  return result;
}
describe('authorization resilience remains fail closed', () => {
  it('real denied permission redirects to unauthorized without retry', async () => {
    const response=await request();expect(response.headers.get('location')).toBe('http://localhost/unauthorized');expect(mock.permission).toHaveBeenCalledTimes(4);
  });
  it('missing session goes to sign-in', async () => {
    mock.auth.mockResolvedValue({data:{user:null},error:{name:'AuthSessionMissingError'}});
    expect((await request()).headers.get('location')).toBe('http://localhost/sign-in');expect(mock.auth).toHaveBeenCalledTimes(1);
  });
  it('invalid session is not retried', async () => {
    mock.auth.mockResolvedValue({data:{user:null},error:{status:401,code:'bad_jwt'}});
    expect((await request()).headers.get('location')).toBe('http://localhost/sign-in');expect(mock.auth).toHaveBeenCalledTimes(1);
  });
  it('one transient permission failure then true permits normal access', async () => {
    let selfCalls=0;
    mock.permission.mockImplementation((code:string) => Promise.resolve(code==='attendance.self' ? (++selfCalls===1 ? {data:null,error:reset} : {data:true,error:null}) : {data:false,error:null}));
    const response=await request();expect(response.headers.get('x-middleware-next')).toBe('1');expect(selfCalls).toBe(2);
  });
  it('repeated transport failure returns safe 503, never unauthorized or content', async () => {
    mock.permission.mockResolvedValue({data:null,error:reset});
    const response=await request();expect(response.status).toBe(503);expect(response.headers.get('location')).toBeNull();expect(response.headers.get('x-middleware-next')).toBeNull();expect(mock.permission).toHaveBeenCalledTimes(8);
    expect(await response.text()).toContain("We couldn't verify access right now.");
  });
  it('RLS rejection is never retried or converted to allowed', async () => {
    mock.permission.mockResolvedValue({data:null,error:{code:'42501',message:'permission denied'}});
    const response=await request();expect(response.status).toBe(503);expect(mock.permission).toHaveBeenCalledTimes(4);
  });
  it('profile transport errors no longer fail open', async () => {
    mock.profile.mockResolvedValue({data:null,error:reset});
    expect((await request()).status).toBe(503);expect(mock.profile).toHaveBeenCalledTimes(2);expect(mock.permission).not.toHaveBeenCalled();
  });
  it('a missing profile remains a genuine denial', async () => {
    mock.profile.mockResolvedValue({data:null,error:null});expect((await request()).headers.get('location')).toContain('/unauthorized');
  });
  it('malformed permission result is unavailable, not a fabricated denial', async () => {
    mock.permission.mockResolvedValue({data:null,error:null});expect((await request()).status).toBe(503);expect(mock.permission).toHaveBeenCalledTimes(4);
  });
  it('session transport failure is not mislabeled as signed out', async () => {
    mock.auth.mockResolvedValue({data:{user:null},error:reset});expect((await request()).status).toBe(503);expect(mock.auth).toHaveBeenCalledTimes(2);
  });
  it('retry success returning false still denies', async () => {
    mock.permission.mockResolvedValueOnce({data:null,error:reset}).mockResolvedValue({data:false,error:null});expect((await request()).headers.get('location')).toContain('/unauthorized');
  });
});
describe('narrow retry classifier and bounds', () => {
  it.each(['42501','23505','PGRST202','invalid_credentials'])('does not retry deterministic %s', code => {
    expect(isTransientAuthorizationError({code,message:'fetch failed'})).toBe(false);
  });
  it.each([400,401,403,422,429])('does not retry HTTP %s', status => {
    expect(isTransientAuthorizationError({status,message:'fetch failed'})).toBe(false);
  });
  it('recognizes nested reset and timeout', () => {
    expect(isTransientAuthorizationError(new TypeError('fetch failed',{cause:reset}))).toBe(true);
    expect(isTransientAuthorizationError({name:'TimeoutError'})).toBe(true);
  });
  it('retries a thrown reset once and records exactly one retry', async () => {
    const operation=vi.fn().mockRejectedValueOnce(reset).mockResolvedValue({error:null});const onRetry=vi.fn();
    const result=withAuthorizationTransportRetry(operation,{onRetry});await vi.runAllTimersAsync();expect(await result).toEqual({error:null});expect(operation).toHaveBeenCalledTimes(2);expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it('bounds a hanging lookup and stays unavailable', async () => {
    const operation=vi.fn(() => new Promise<{error:null}>(() => {}));
    const result=authorizationRead(operation,'test');const assertion=expect(result).rejects.toBeInstanceOf(AuthorizationUnavailable);
    await vi.runAllTimersAsync();await assertion;expect(operation).toHaveBeenCalledTimes(2);
  });
});
