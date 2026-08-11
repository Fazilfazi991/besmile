import { describe, expect, it } from 'vitest';
import { blockFieldsFromStored, blockPayloadFromFields } from './calendar-block-rules';

describe('personal block time payloads', () => {
  it('creates a Kolkata block for the owner-supplied wall-clock date', () => {
    expect(blockPayloadFromFields({ date: '2026-08-11', startTime: '15:00', endTime: '16:00', allDay: false, title: 'School pickup' })).toMatchObject({ start_at: '2026-08-11T09:30:00.000Z', end_at: '2026-08-11T10:30:00.000Z', title: 'School pickup' });
  });
  it('rejects an invalid or zero-length interval using [start, end) semantics', () => {
    expect(() => blockPayloadFromFields({ date: '2026-08-11', startTime: '10:00', endTime: '10:00', allDay: false, title: '' })).toThrow('End time');
  });
  it('creates all-day blocks from one Kolkata midnight through the next', () => {
    expect(blockPayloadFromFields({ date: '2026-08-11', startTime: '09:00', endTime: '10:00', allDay: true, title: '' })).toMatchObject({ start_at: '2026-08-10T18:30:00.000Z', end_at: '2026-08-11T18:30:00.000Z', all_day: true });
  });
  it('returns the owner-visible private reason when preparing an edit', () => {
    expect(blockFieldsFromStored({ start_at: '2026-08-11T09:30:00.000Z', end_at: '2026-08-11T10:30:00.000Z', title: 'Private reason' })).toMatchObject({ date: '2026-08-11', startTime: '15:00', title: 'Private reason' });
  });
});
