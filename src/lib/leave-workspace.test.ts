import { describe, expect, it } from 'vitest';
import { filterLeaveRequests, paginateRecords } from './leave-workspace';

const requests = [
  { id: '1', status: 'pending', leave_types: { name: 'Annual leave' }, employee: { full_name: 'Sample Alpha', employee_code: 'QA-001' } },
  { id: '2', status: 'approved', leave_types: { name: 'Sick leave' }, employee: { full_name: 'Sample Beta', designation: 'Clinician' } },
  { id: '3', status: 'cancelled', leave_type: 'Annual leave', employee: { full_name: 'Sample Gamma' } },
];

describe('leave workspace records', () => {
  it('combines status, leave type, and case-insensitive search filters', () => {
    expect(filterLeaveRequests(requests, { status: 'pending', query: 'qa-001', leaveType: 'Annual leave' }).map(item => item.id)).toEqual(['1']);
    expect(filterLeaveRequests(requests, { status: 'all', query: 'clinician', leaveType: '' }).map(item => item.id)).toEqual(['2']);
  });

  it('paginates without losing records and clamps stale page numbers', () => {
    expect(paginateRecords(requests, 1, 2)).toMatchObject({ page: 1, pageCount: 2, records: requests.slice(0, 2) });
    expect(paginateRecords(requests, 9, 2)).toMatchObject({ page: 2, pageCount: 2, records: requests.slice(2) });
  });
});
