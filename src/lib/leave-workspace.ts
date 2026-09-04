export type LeaveStatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export type LeaveWorkspaceRequest = {
  id: string;
  status?: string | null;
  leave_type?: string | null;
  leave_types?: { name?: string | null } | null;
  employee?: { full_name?: string | null; employee_code?: string | null; email?: string | null; designation?: string | null } | null;
};

export function filterLeaveRequests<T extends LeaveWorkspaceRequest>(requests: T[], filters: { status: LeaveStatusFilter; query: string; leaveType: string }) {
  const query = filters.query.trim().toLocaleLowerCase();
  return requests.filter(request => {
    if (filters.status !== 'all' && request.status !== filters.status) return false;
    const type = request.leave_types?.name || request.leave_type || '';
    if (filters.leaveType && type !== filters.leaveType) return false;
    if (!query) return true;
    return [request.employee?.full_name, request.employee?.employee_code, request.employee?.email, request.employee?.designation, type]
      .some(value => value?.toLocaleLowerCase().includes(query));
  });
}

export function paginateRecords<T>(records: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return { page: safePage, pageCount, records: records.slice((safePage - 1) * pageSize, safePage * pageSize) };
}
