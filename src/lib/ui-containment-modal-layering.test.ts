import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const clients = readFileSync(new URL('../components/patient-list.tsx', import.meta.url), 'utf8');
const crm = readFileSync(new URL('../components/crm-lead-management.tsx', import.meta.url), 'utf8');
const density = readFileSync(new URL('../app/workspace-density.css', import.meta.url), 'utf8');

describe('Clients table containment', () => {
  it('contains intrinsic table width in a keyboard-accessible horizontal scroll region', () => {
    expect(clients).toContain('client-table-scroll card max-w-full min-w-0 overflow-x-auto overscroll-x-contain');
    expect(clients).toContain('role="region" aria-label="Client records" tabIndex={0}');
    expect(clients).toContain('w-full min-w-[1040px] table-fixed');
  });

  it('keeps long values inside table cells and the right-side actions reachable', () => {
    expect(clients).toContain('className="break-all p-3">{patient.email');
    expect(clients).toContain('className="whitespace-nowrap p-3"><a');
    expect(clients).toContain('href={`${patientPath(basePath, patient)}?edit=1`}');
  });
});

describe('CRM modal error ownership and layering', () => {
  it('keeps page errors out of the active modal layer and renders submission errors inside it', () => {
    expect(crm).toContain('pageError && !addOpen');
    expect(crm).toContain('modalError ? <p role="alert" aria-live="assertive"');
    expect(crm.indexOf('modalError ? <p role="alert"')).toBeGreaterThan(crm.indexOf('role="dialog"'));
  });

  it('uses the shared overlay tier and exposes accessible dialog semantics', () => {
    expect(density).toContain('.crm-lead-modal-layer{z-index:120}');
    expect(crm).toContain('className="crm-lead-modal-layer fixed inset-0');
    expect(crm).toContain('aria-modal="true"');
    expect(crm).toContain('aria-labelledby="add-lead-title"');
    expect(crm).toContain('event.key === "Escape"');
    expect(crm).toContain('event.key !== "Tab"');
  });
});
