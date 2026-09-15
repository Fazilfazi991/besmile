import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultCrmLeadDate, isValidCrmLeadDate } from './crm-lead-date';

describe('CRM Lead Date', () => {
  it('defaults to the existing Asia/Kolkata business date, including the UTC day boundary', () => {
    expect(defaultCrmLeadDate(new Date('2026-09-15T18:29:00.000Z'))).toBe('2026-09-15');
    expect(defaultCrmLeadDate(new Date('2026-09-15T18:30:00.000Z'))).toBe('2026-09-16');
  });

  it('accepts a manually chosen earlier date and rejects missing or impossible dates', () => {
    expect(isValidCrmLeadDate('2026-08-21')).toBe(true);
    expect(isValidCrmLeadDate('2024-02-29')).toBe(true);
    expect(isValidCrmLeadDate('0099-01-01')).toBe(true);
    expect(isValidCrmLeadDate('')).toBe(false);
    expect(isValidCrmLeadDate('0000-01-01')).toBe(false);
    expect(isValidCrmLeadDate('2026-02-30')).toBe(false);
    expect(isValidCrmLeadDate('2026-13-01')).toBe(false);
    expect(isValidCrmLeadDate('2026-8-21')).toBe(false);
  });

  it('keeps Lead Date wired into both existing employee create and edit payloads', () => {
    const create = readFileSync('src/app/employee/crm/leads/page.tsx', 'utf8');
    const edit = readFileSync('src/app/employee/crm/leads/[id]/page.tsx', 'utf8');
    expect(create).toContain('lead_date: defaultCrmLeadDate()');
    expect(create).toContain('type="date" value={form.lead_date}');
    expect(create).toContain('createMyCrmLead({ ...form,');
    expect(edit).toContain('lead_date: item.lead_date');
    expect(edit).toContain('type="date" className="input mt-1 w-full min-w-0" value={editForm.lead_date');
    expect(edit).toContain('updateMyCrmLead(profile.id, id, { ...editForm,');
    expect(edit).toContain("['Lead Date', lead.lead_date]");
  });
});
