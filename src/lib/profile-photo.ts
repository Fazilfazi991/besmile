export async function signedProfilePhotoUrl(
  client: any,
  path?: string | null,
  expiresIn = 300,
) {
  if (!path) return null;
  const { data, error } = await client.storage
    .from("profile-photos")
    .createSignedUrl(path, expiresIn);
  return error ? null : data?.signedUrl || null;
}
