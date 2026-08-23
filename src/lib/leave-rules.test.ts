import {describe,it,expect} from 'vitest';
import { validateLeaveRequestDates } from './leave-rules';
import {canCancelLeave,hasLeaveOverlap,hasSufficientBalance,isRlsError,leaveDays} from './leave-rules';
import {monthlyDays} from './attendance-rules';

describe('leave rules',()=>{
  it('rejects missing and reversed dates before a database request',()=>{expect(validateLeaveRequestDates('', '2026-08-15')).toBe('Select a start date.');expect(validateLeaveRequestDates('2026-08-15','')).toBe('Select an end date.');expect(validateLeaveRequestDates('2026-08-16','2026-08-15')).toBe('End date cannot be before the start date.');});
  it('excludes weekends and holidays',()=>expect(leaveDays('2026-07-17','2026-07-21',[1,2,3,4,5],new Set(['2026-07-20']))).toBe(2));
  it('calculates a half day',()=>expect(leaveDays('2026-07-21','2026-07-21',[1,2,3,4,5],new Set(),true)).toBe(.5));
  it('rejects invalid ranges and non-working selections',()=>{expect(()=>leaveDays('2026-07-22','2026-07-21',[1,2,3,4,5],new Set())).toThrow();expect(()=>leaveDays('2026-07-19','2026-07-19',[1,2,3,4,5],new Set())).toThrow()});
  it('detects active overlapping requests',()=>{expect(hasLeaveOverlap({starts_on:'2026-07-11',ends_on:'2026-07-12'},[{starts_on:'2026-07-10',ends_on:'2026-07-11',status:'pending'}])).toBe(true);expect(hasLeaveOverlap({starts_on:'2026-07-11',ends_on:'2026-07-12'},[{starts_on:'2026-07-10',ends_on:'2026-07-11',status:'withdrawn'}])).toBe(false)});
  it('allows only eligible cancellation',()=>{expect(canCancelLeave('pending','2026-07-20','2026-07-20')).toBe(true);expect(canCancelLeave('approved','2026-07-20','2026-07-20')).toBe(false);expect(canCancelLeave('rejected','2026-07-21','2026-07-20')).toBe(false)});
  it('validates balance and recognizes RLS failures',()=>{expect(hasSufficientBalance(4,2,2)).toBe(true);expect(hasSufficientBalance(4,2,2.5)).toBe(false);expect(isRlsError({code:'42501'})).toBe(true);expect(isRlsError({message:'new row violates row-level security policy'})).toBe(true)});
  it('feeds approved leave into attendance classification',()=>{const days=monthlyDays(new Date('2026-07-01T12:00:00Z'),{timezone:'UTC',work_start:'09:00',work_end:'18:00',grace_minutes:10,overtime_after_minutes:480,working_days:[1,2,3,4,5]},[],new Set(),[{starts_on:'2026-07-01',ends_on:'2026-07-01',status:'approved'}]);expect(days[0].status).toBe('leave')});
});
