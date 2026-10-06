import { newTemporaryCredential } from './temporary-credential';

export async function regenerateClinicianTemporaryCredential(session: any, service: any, input: { doctorId: string; requestId: string }) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.doctorId) || !uuid.test(input.requestId)) throw new Error('Choose an existing clinician and a valid request ID.');
  const args = { target_doctor: input.doctorId.toLowerCase(), request_id: input.requestId.toLowerCase() };
  const reserved = await session.rpc('reserve_clinician_temporary_credential', args);
  if (reserved.error) throw reserved.error;
  const reservation = reserved.data;
  if (reservation?.status === 'completed') return { profileId: reservation.profile_id, replayed: true };
  if (!reservation?.newly_reserved || !reservation.profile_id) throw new Error('This credential request already started. Review its outcome before retrying.');
  const fail = async () => { await service.rpc('finish_clinician_temporary_credential', { request_id: args.request_id, succeeded: false }); };
  // The DB validates manager scope and identity. Recheck live Auth immediately before
  // the password-only Admin API call, including sign-in history and confirmation.
  const found = await service.auth.admin.getUserById(reservation.profile_id);
  const user = found.data?.user;
  if (found.error || !user || user.id !== reservation.profile_id || user.email?.toLowerCase() !== reservation.login_email
    || !user.email_confirmed_at || user.last_sign_in_at || (user.banned_until && Date.parse(user.banned_until) > Date.now())
    || user.app_metadata?.existing_clinician_id !== args.target_doctor) {
    await fail(); throw new Error('This account requires manual credential review. Its password was not changed.');
  }
  const current = await service.rpc('validate_clinician_temporary_credential', { request_id: args.request_id });
  if (current.error || current.data !== true) {
    await fail(); throw new Error('This account requires manual credential review. Its password was not changed.');
  }
  const temporaryPassword = newTemporaryCredential();
  const updated = await service.auth.admin.updateUserById(user.id, { password: temporaryPassword });
  // A transport error may follow a successful Auth write. Keep the reservation
  // pending for manual review rather than permitting an automatic second reset.
  if (updated.error) throw new Error('Credential update needs manual review. Do not repeat this request.');
  const finished = await service.rpc('finish_clinician_temporary_credential', { request_id: args.request_id, succeeded: true });
  if (finished.error) throw new Error('Credential update needs manual review. Do not repeat this request.');
  return { profileId: user.id, replayed: false, temporaryPassword };
}
