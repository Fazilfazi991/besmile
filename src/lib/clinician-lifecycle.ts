const missingLifecycleRpc = /could not find the function\s+public\.set_clinician_active/i;

/** Keeps implementation details from PostgREST out of clinician lifecycle UI feedback. */
export function clinicianLifecycleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (missingLifecycleRpc.test(message)) return 'Unable to update clinician status. Please try again.';
  if (/^This clinician has \d+ upcoming or active appointments?/i.test(message)) return message;
  if (/^Permission denied for clinician lifecycle management/i.test(message)) return 'You do not have permission to update clinician status.';
  if (/^Clinician unavailable\.?$/i.test(message)) return 'This clinician is no longer available.';
  return 'Unable to update clinician status. Please try again.';
}
