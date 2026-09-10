import { withAuthorizationTransportRetry, authorizationRead, AuthorizationUnavailable } from './authorization-transport';
type PermissionClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
};

export async function grantedPermissions(
  db: PermissionClient,
  permissionCodes: readonly string[],
) {
  const result = await withAuthorizationTransportRetry(() => db.rpc('granted_permissions', {
    permission_codes: [...permissionCodes],
  })).catch(() => { throw new AuthorizationUnavailable(); });
  if (!result.error) {
    if (!Array.isArray(result.data) || result.data.some((code: unknown) => typeof code !== 'string')) throw new AuthorizationUnavailable();
    return new Set(result.data as string[]);
  }
  if (result.error.code !== 'PGRST202') throw new AuthorizationUnavailable();

  const legacy = await Promise.all(
    permissionCodes.map((permission_code) =>
      authorizationRead(() => db.rpc('has_permission', { permission_code }), 'navigation.permission'),
    ),
  );
  if (legacy.some(result => typeof result.data !== 'boolean')) throw new AuthorizationUnavailable();
  return new Set(
    permissionCodes.filter((_, index) => legacy[index].data === true),
  );
}
