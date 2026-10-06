import { describe, expect, it } from 'vitest';
import { normalizeClinicianAvailability as normalize } from './clinician-availability-normalizer';
describe('workbook availability dry run', () => {
  it('retains source cells and parses split weekday windows in business time', () => {
    const result = normalize({row:10,name:'QA',days:[{cell:'E10',value:'MONDAY - FRIDAY'}],times:[{cell:'F10',value:'10 AM - 12 PM, 2PM-7PM'}]});
    expect(result.time_zone).toBe('Asia/Kolkata'); expect(result.proposed_ranges).toHaveLength(10);
    expect(result.proposed_ranges[0]).toEqual({day_of_week:1,start_time:'10:00',end_time:'12:00'}); expect(result.provenance.map(cell=>cell.cell)).toEqual(['E10','F10']);
  });
  it('pairs separate Sunday and weekday cells without spreading a time to all days', () => {
    const result = normalize({row:79,name:'QA',days:[{cell:'E79',value:'Sunday'},{cell:'E80',value:'Mon- Saturday'}],times:[{cell:'F79',value:'2.00PM- 3.00PM'},{cell:'F80',value:'6PM-10PM'}]});
    expect(result.proposed_ranges).toHaveLength(7); expect(result.proposed_ranges[0]).toEqual({day_of_week:0,start_time:'14:00',end_time:'15:00'});
  });
  it.each([2,17,38,73,108,116,129,146,160])('holds approved ambiguity row %s without inferred ranges', row => {
    const result=normalize({row,name:'QA',days:[{cell:`E${row}`,value:'Monday'}],times:[{cell:`F${row}`,value:'1 PM-2 PM'}]});expect(result.status).toBe('NO CHANGE — REVIEW REQUIRED');expect(result.proposed_ranges).toEqual([]);
  });
  it.each(['1 PM','Anytime','11 PM-1 AM','2 PM-1 PM','13 PM-2 PM','10 AM-12 PM,11 AM-1 PM'])('rejects ambiguous or overlapping range %s', value => {
    expect(normalize({row:1,name:'QA',days:[{cell:'E1',value:'Monday'}],times:[{cell:'F1',value}]}).proposed_ranges).toEqual([]);
  });
});
