import { describe, expect, it } from 'vitest';
import { overlaps, validateInterval } from './calendar-meeting-rules';

const block = { start_at: '2026-08-11T04:30:00.000Z', end_at: '2026-08-11T05:30:00.000Z' }; // 10–11 IST
describe('calendar meeting intervals', () => {
  it('uses [start,end) boundaries', () => {
    expect(overlaps(block, { start_at: '2026-08-11T03:30:00.000Z', end_at: '2026-08-11T04:30:00.000Z' })).toBe(false);
    expect(overlaps(block, { start_at: '2026-08-11T05:30:00.000Z', end_at: '2026-08-11T06:30:00.000Z' })).toBe(false);
  });
  it('detects exact, beginning, ending, and contained overlaps', () => {
    for (const range of [block, { start_at: '2026-08-11T05:00:00.000Z', end_at: '2026-08-11T06:00:00.000Z' }, { start_at: '2026-08-11T04:00:00.000Z', end_at: '2026-08-11T05:00:00.000Z' }, { start_at: '2026-08-11T04:45:00.000Z', end_at: '2026-08-11T05:00:00.000Z' }]) expect(overlaps(block, range)).toBe(true);
  });
  it('rejects invalid intervals', () => expect(() => validateInterval(block.end_at, block.start_at)).toThrow('End time'));
});
