import { describe, expect, it } from 'vitest';
import { followupLabel, isPositiveFollowupNumber, nextFollowupNumber, ordinal } from './crm-followups';

describe('CRM follow-up numbering', () => {
  it('formats ordinal labels', () => { expect(ordinal(1)).toBe('1st'); expect(ordinal(11)).toBe('11th'); expect(ordinal(21)).toBe('21st'); });
  it('suggests the number after the highest saved number', () => expect(nextFollowupNumber([1, null, 4, 2])).toBe(5));
  it('handles historical unnumbered follow-ups', () => expect(followupLabel(null)).toBe('Unnumbered follow-up'));
  it('validates positive integers', () => { expect(isPositiveFollowupNumber(1)).toBe(true); expect(isPositiveFollowupNumber(0)).toBe(false); expect(isPositiveFollowupNumber(1.5)).toBe(false); });
});
