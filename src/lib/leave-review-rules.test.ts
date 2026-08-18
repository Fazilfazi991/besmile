import { describe, expect, it } from 'vitest';
import { canReviewLeaveRequest } from './leave-rules';
import { adminNavigation, adminRouteRequirement, filterNavigation, permissionAllows } from './permission-access';

describe('General Manager leave safeguards', () => {
  it('limits General Manager leave reviews to executives and prevents self-review', () => {
    expect(canReviewLeaveRequest({ reviewerId: 'gm', requesterId: 'gm', reviewerRole: 'general_manager', requesterRole: 'general_manager', status: 'pending' })).toBe(false);
    expect(canReviewLeaveRequest({ reviewerId: 'staff', requesterId: 'gm', reviewerRole: 'staff', requesterRole: 'general_manager', status: 'pending' })).toBe(false);
    expect(canReviewLeaveRequest({ reviewerId: 'director', requesterId: 'gm', reviewerRole: 'director', requesterRole: 'general_manager', status: 'pending' })).toBe(true);
    expect(canReviewLeaveRequest({ reviewerId: 'chair', requesterId: 'gm', reviewerRole: 'chairman', requesterRole: 'general_manager', status: 'pending' })).toBe(true);
    expect(canReviewLeaveRequest({ reviewerId: 'director', requesterId: 'staff', reviewerRole: 'director', requesterRole: 'staff', status: 'approved' })).toBe(false);
  });

  it('keeps personal leave available alongside management leave approvals', () => {
    const granted = new Set(['leave.manage']);
    expect(permissionAllows(granted, adminRouteRequirement('/admin/my-leave'))).toBe(true);
    const labels = filterNavigation(adminNavigation, granted).flatMap(group => group.links.map(link => link.label));
    expect(labels).toEqual(expect.arrayContaining(['My Leave', 'Leave Approvals']));
  });
});
