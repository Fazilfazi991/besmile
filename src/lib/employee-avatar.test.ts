import { describe, expect, it } from 'vitest';
import { employeeAvatarInitials, resolveEmployeeAvatar } from './employee-avatar';

describe('employee avatar resolution', () => {
  it('uses an uploaded profile photo before a demo fallback', () => {
    expect(resolveEmployeeAvatar('Aiswarya P', 'https://signed.example/aiswarya.webp')).toBe('https://signed.example/aiswarya.webp');
  });

  it('maps known demo employees and falls back cleanly for unknown names', () => {
    expect(resolveEmployeeAvatar('  Aiswarya   P  ')).toBe('/employee_demo_dps_webp/aiswarya_p.webp');
    expect(resolveEmployeeAvatar('Unknown Employee')).toBeNull();
    expect(employeeAvatarInitials('Unknown Employee')).toBe('UE');
  });
});
