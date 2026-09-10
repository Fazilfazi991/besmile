import { redirect } from 'next/navigation';
import { authorizationRead, AuthorizationUnavailable } from './authorization-transport';

export async function serverAuthorizationRead<T extends { error?: unknown }>(
  operation: (signal: AbortSignal) => PromiseLike<T>, context: string, sessionLookup = false,
) {
  return serverAuthorizationBoundary(() => authorizationRead(operation, context, sessionLookup));
}

export async function serverAuthorizationBoundary<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof AuthorizationUnavailable) redirect('/access-unavailable');
    throw error;
  }
}

export async function serverPermissionRead<T extends { error?: unknown; data: unknown }>(operation: (signal: AbortSignal) => PromiseLike<T>, context: string) {
  const result = await serverAuthorizationRead(operation, context);
  if (typeof result.data !== 'boolean') redirect('/access-unavailable');
  return result;
}
