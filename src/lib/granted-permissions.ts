type PermissionClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
};

export async function grantedPermissions(
  db: PermissionClient,
  permissionCodes: readonly string[],
) {
  const result = await db.rpc('granted_permissions', {
    permission_codes: [...permissionCodes],
  });
  if (!result.error) return new Set((result.data || []) as string[]);
  if (
    result.error.code !== 'PGRST202' &&
    !/granted_permissions|schema cache|could not find/i.test(result.error.message || '')
  ) throw result.error;

  const legacy = await Promise.all(
    permissionCodes.map((permission_code) =>
      db.rpc('has_permission', { permission_code }),
    ),
  );
  return new Set(
    permissionCodes.filter((_, index) => legacy[index].data === true),
  );
}
