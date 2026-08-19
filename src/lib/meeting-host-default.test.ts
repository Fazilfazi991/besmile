import { describe, expect, it } from 'vitest';
import { defaultMeetingHostId } from './meeting-host-default';

describe('defaultMeetingHostId', () => {
  const candidates = [{ id: 'assistant' }, { id: 'director' }];

  it('defaults an eligible creator to themself', () => {
    expect(defaultMeetingHostId('assistant', true, candidates)).toBe('assistant');
  });

  it('does not default an ineligible creator or an unknown candidate', () => {
    expect(defaultMeetingHostId('assistant', false, candidates)).toBe('');
    expect(defaultMeetingHostId('ordinary-staff', true, candidates)).toBe('');
  });
});
