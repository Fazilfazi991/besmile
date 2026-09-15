import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, pages, ranges } = vi.hoisted(() => ({
  from: vi.fn(),
  pages: [] as Array<{ data?: Array<{ id: string; full_name: string }>; error?: Error }>,
  ranges: [] as Array<[number, number]>,
}));
vi.mock('./supabase', () => ({ supabase: { from } }));
import { calendarMeetingRepository } from './calendar-meeting-repository';

describe('meeting employee picker pagination', () => {
  beforeEach(() => {
    pages.length = 0;
    ranges.length = 0;
    from.mockImplementation((table: string) => {
      expect(table).toBe('profiles');
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        or: () => query,
        range: (first: number, last: number) => {
          ranges.push([first, last]);
          return Promise.resolve(pages.shift());
        },
      };
      return query;
    });
  });

  it('can select an authorized employee after the first 40 results', async () => {
    pages.push(
      { data: Array.from({ length: 40 }, (_, index) => ({ id: `${index}`, full_name: `Person ${index}` })) },
      { data: [{ id: 'employee', full_name: 'QA Employee With An Exceptionally Long Name For Mobile Layout' }] },
    );
    const employees = await calendarMeetingRepository.meetingEmployees();
    expect(employees).toHaveLength(41);
    expect(employees[40].id).toBe('employee');
    expect(ranges).toEqual([[0, 39], [40, 79]]);
  });

  it('does not turn a failed later page into an incomplete employee list', async () => {
    const error = new Error('Employee page failed');
    pages.push({ data: Array.from({ length: 40 }, (_, index) => ({ id: `${index}`, full_name: 'Employee' })) }, { error });
    await expect(calendarMeetingRepository.meetingEmployees()).rejects.toBe(error);
  });
});
