export const crmRecordUnavailableMessage = 'This lead is unavailable or is not assigned to you.';

export function safeCrmLoadMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return message === crmRecordUnavailableMessage ? message : 'CRM data could not be loaded. Please try again.';
}
