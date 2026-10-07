import { withAuthorizationTransportRetry, authorizationRead, AuthorizationUnavailable } from './authorization-transport';
type PermissionClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> & {
    abortSignal?: (signal: AbortSignal) => PromiseLike<{ data: any; error: any }>;
  };
};

function permissionRead(db: PermissionClient, name: string, args: Record<string, unknown>, signal: AbortSignal) {
  const query = db.rpc(name, args);
  return query.abortSignal ? query.abortSignal(signal) : query;
}

export async function grantedPermissions(
  db: PermissionClient,
  permissionCodes: readonly string[],
) {
  const result = await withAuthorizationTransportRetry(signal => permissionRead(db, 'granted_permissions', {
    permission_codes: [...permissionCodes],
  }, signal)).catch(() => { throw new AuthorizationUnavailable(); });
  if (!result.error) {
    if (!Array.isArray(result.data) || result.data.some((code: unknown) => typeof code !== 'string' || !permissionCodes.includes(code))) throw new AuthorizationUnavailable();
    return new Set(result.data as string[]);
  }
  if (result.error.code !== 'PGRST202') throw new AuthorizationUnavailable();

  const legacy = await Promise.all(
    permissionCodes.map((permission_code) =>
      authorizationRead(signal => permissionRead(db, 'has_permission', { permission_code }, signal), 'navigation.permission'),
    ),
  );
  if (legacy.some(result => typeof result.data !== 'boolean')) throw new AuthorizationUnavailable();
  return new Set(
    permissionCodes.filter((_, index) => legacy[index].data === true),
  );
}
