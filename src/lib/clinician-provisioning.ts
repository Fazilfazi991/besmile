import { newTemporaryCredential } from './temporary-credential';

/** The reservation RPC owns authorization and immutable request binding.
 * Auth recovery only accepts server app_metadata for the same reservation.
 * No retry path updates a password or claims an unrelated email identity. */
export async function provisionExternalClinician(session: any, service: any, input: {
  doctorId: string; email: string; requestId: string; fields: Record<string, string>;
}) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid login email.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.doctorId) || !uuid.test(input.requestId)) throw new Error('Choose an existing clinician and a valid request ID.');
  input = { ...input, doctorId: input.doctorId.toLowerCase(), requestId: input.requestId.toLowerCase() };
  const allowed = ['full_name', 'phone', 'personal_email', 'qualification', 'specialization', 'professional_information'];
  if (!input.fields || Array.isArray(input.fields) || Object.entries(input.fields).some(([key, value]) => !allowed.includes(key) || typeof value !== 'string' || value.length > 4000)
    || !input.fields.full_name?.trim()) throw new Error('Provide approved profile fields and a full name.');
  const reserved = await session.rpc('reserve_clinician_provision', {
    target_doctor: input.doctorId, login_email: email, request_id: input.requestId, profile_fields: input.fields,
  });
  if (reserved.error) throw reserved.error;
  if (reserved.data?.completed_at && reserved.data.profile_id) return { profileId: reserved.data.profile_id, replayed: true };
  const temporaryPassword = newTemporaryCredential();
  const belongs = (user: any) => user?.email?.toLowerCase() === email
    && user?.app_metadata?.clinician_provision_request_id === input.requestId
    && user?.app_metadata?.existing_clinician_id === input.doctorId;
  const created = await service.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true,
    app_metadata: { clinician_provision_request_id: input.requestId, existing_clinician_id: input.doctorId },
  });
  let identity = created.data?.user;
  if (created.error) {
    // Recover only an Auth identity this exact request created before a failed
    // DB completion. Admin listUsers is server-only and never returned to UI.
    for (let page = 1; page <= 100 && !identity; page++) {
      const result = await service.auth.admin.listUsers({ page, perPage: 100 });
      if (result.error) throw new Error('Unable to verify the existing Auth identity. Retry this request.');
      const candidate = result.data.users.find((user: any) => user.email?.toLowerCase() === email);
      if (candidate) {
        if (!belongs(candidate)) throw new Error('This login email belongs to another Auth account. It has not been changed.');
        identity = candidate;
      }
      if (result.data.users.length < 100) break;
    }
    if (!identity) throw new Error('Account creation could not be completed. Retry this request.');
  }
  if (!belongs(identity)) throw new Error('Auth ownership could not be verified.');
  const linked = await service.rpc('complete_clinician_provision', { request_id: input.requestId, auth_user_id: identity.id });
  if (linked.error) throw new Error('Account is reserved. Retry the same request to complete its clinician link.');
  // A recovered identity still owns its original password. Never reset it on retry,
  // and never return a newly generated password that does not belong to that user.
  return { profileId: linked.data, replayed: Boolean(created.error),
    ...(!created.error ? { temporaryPassword } : {}) };
}
