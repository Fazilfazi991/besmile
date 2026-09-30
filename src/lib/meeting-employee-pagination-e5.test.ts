import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, pages, ranges, filters } = vi.hoisted(() => ({
  rpc: vi.fn(),
  pages: [] as Array<{ data?: Array<{ id: string; full_name: string; designation?: string; department_name?: string }>; error?: Error }>,
  ranges: [] as Array<[number, number]>,
  filters: [] as Array<[string, string]>,
}));
vi.mock('./supabase', () => ({ supabase: { rpc } }));
import { calendarMeetingRepository } from './calendar-meeting-repository';

describe('meeting attendee directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pages.length = 0;
    ranges.length = 0;
    filters.length = 0;
    rpc.mockImplementation((name: string) => {
      expect(name).toBe('meeting_workforce');
      const request = {
        ilike: (column: string, value: string) => { filters.push([column, value]); return request; },
        range: (first: number, last: number) => {
          ranges.push([first, last]);
          return Promise.resolve(pages.shift());
        },
      };
      return request;
    });
  });

  it('reproduces and fixes the one-person picker by using the authorized directory', async () => {
    pages.push({ data: [
      { id: 'diya', full_name: 'Diya Anthikat', designation: 'Admin', department_name: 'Administration' },
      { id: 'aiswarya', full_name: 'Aiswarya P', designation: 'Psychologist', department_name: 'Clinical' },
    ] });
    const employees = await calendarMeetingRepository.meetingEmployees();
    expect(employees.map(employee => employee.id)).toEqual(['diya', 'aiswarya']);
    expect(employees[1].department.name).toBe('Clinical');
    expect(rpc).toHaveBeenCalledWith('meeting_workforce');
  });

  it('includes employees beyond the first 40 results', async () => {
    pages.push(
      { data: Array.from({ length: 40 }, (_, index) => ({ id: `${index}`, full_name: `Person ${index}` })) },
      { data: [{ id: 'employee', full_name: 'QA Employee With An Exceptionally Long Name For Mobile Layout' }] },
    );
    const employees = await calendarMeetingRepository.meetingEmployees();
    expect(employees).toHaveLength(41);
    expect(employees[40].id).toBe('employee');
    expect(ranges).toEqual([[0, 39], [40, 79]]);
  });

  it('filters names through the authorized directory', async () => {
    pages.push({ data: [{ id: 'diya', full_name: 'Diya Anthikat' }] });
    await calendarMeetingRepository.meetingEmployees('Diya');
    expect(filters).toEqual([['full_name', '%Diya%']]);
  });

  it('does not turn a failed later page into an incomplete employee list', async () => {
    const error = new Error('Employee page failed');
    pages.push({ data: Array.from({ length: 40 }, (_, index) => ({ id: `${index}`, full_name: 'Employee' })) }, { error });
    await expect(calendarMeetingRepository.meetingEmployees()).rejects.toBe(error);
  });
});
