import { describe, expect, it } from 'vitest';
import { adminNavigation, adminRouteRequirement, filterNavigation, permissionAllows } from './permission-access';
import { financeTotals, outstandingInvoice } from './finance-rules';

describe('Batch 9 business status',()=>{
 it('reuses canonical cash movement without specialized payment double counting',()=>{const totals=financeTotals([{transaction_type:'income',amount:10000},{transaction_type:'expense',amount:2000},{transaction_type:'payroll_payment',amount:3000}]);expect(totals).toEqual({income:10000,expenses:5000});expect(totals.income-totals.expenses).toBe(5000)});
 it('uses invoice payments for exact receivables',()=>{expect(outstandingInvoice(12000,5000)).toBe(7000);expect(outstandingInvoice(12000,12000)).toBe(0)});
 it('keeps business status management-only in navigation and direct routing',()=>{expect(permissionAllows(new Set(['crm.view_team']),adminRouteRequirement('/admin/business-status'))).toBe(false);expect(permissionAllows(new Set(['business_status.view']),adminRouteRequirement('/admin/business-status'))).toBe(true);expect(filterNavigation(adminNavigation,new Set(['business_status.view'])).flatMap(g=>g.links.map(l=>l.label))).toContain('Accounts & Business Status')});
});
