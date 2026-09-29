import { describe, expect, it } from 'vitest';
import { resolveGenieOption } from './genie-option-resolver';

const marketing = [
  { id: 'digital-id', name: 'Digital Marketing' },
  { id: 'performance-id', name: 'Performance Marketing' },
];

const aliases = {
  'Digital Marketing': ['digital', 'digital ads', 'online marketing'],
  'Performance Marketing': ['performance', 'perf marketing'],
};

describe('Genie finite option resolver', () => {
  it.each([
    'digital marketing',
    'Digital Marketing',
    'DIGITAL MARKETING',
    ' digital marketing ',
    'digital   marketing',
    'digital-marketing',
    'digital_marketing',
    'digitalmarketing',
    'digial marketing',
    'digital marketng',
    'digtal marketing',
  ])('resolves %s to the canonical category ID', input => {
    const result = resolveGenieOption({ input, options: marketing, aliases });
    expect(result).toMatchObject({ status: 'match', option: { id: 'digital-id', name: 'Digital Marketing' } });
  });

  it.each(['performance marketing', 'performnce marketing', 'performance', 'perf marketing'])('resolves %s conservatively', input => {
    const result = resolveGenieOption({ input, options: marketing, aliases });
    expect(result).toMatchObject({ status: 'match', option: { id: 'performance-id' } });
  });

  it('uses an alias only when its canonical target is present', () => {
    expect(resolveGenieOption({ input: 'online marketing', options: marketing, aliases })).toMatchObject({ status: 'match', option: { id: 'digital-id' } });
    expect(resolveGenieOption({ input: 'online marketing', options: [marketing[1]], aliases })).toMatchObject({ status: 'no_match' });
  });

  it('returns both candidates for ambiguous shorthand', () => {
    expect(resolveGenieOption({ input: 'marketing', options: marketing, aliases })).toEqual({ status: 'ambiguous', options: marketing });
    const banks = [{ id: 'hdfc', name: 'HDFC Bank' }, { id: 'sbi', name: 'SBI Bank' }];
    expect(resolveGenieOption({ input: 'bank', options: banks })).toEqual({ status: 'ambiguous', options: banks });
  });

  it.each(['?', 'xyzxyz', 'something completely unrelated'])('does not guess for %s', input => {
    expect(resolveGenieOption({ input, options: marketing, aliases }).status).toBe('no_match');
  });
});
