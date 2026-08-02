import { describe, expect, it } from 'vitest';
import { crmRecordUnavailableMessage, safeCrmLoadMessage } from './crm-access-errors';

describe('CRM access errors', () => {
  it('does not expose PostgREST relationship or coercion details', () => {
    expect(safeCrmLoadMessage(new Error('Cannot coerce the result to a single JSON object'))).toBe('CRM data could not be loaded. Please try again.');
    expect(safeCrmLoadMessage(new Error(crmRecordUnavailableMessage))).toBe(crmRecordUnavailableMessage);
  });
});
