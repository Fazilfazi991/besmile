import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { OfficialDocumentActions } from './official-document-actions';
import { employeeRouteRequirement, permissionAllows } from '@/lib/permission-access';

describe('employee Official Documents actions', () => {
  it('shows both independently authorized workflows', () => {
    const html = renderToStaticMarkup(createElement(OfficialDocumentActions, { canCreate: true, canUploadMom: true }));
    expect(html).toContain('Create Document');
    expect(html).toContain('Upload MOM');
    expect(html).toContain('/employee/documents/generate#mom-upload');
  });

  it('shows only MOM for a MOM-only user and allows the upload route', () => {
    const html = renderToStaticMarkup(createElement(OfficialDocumentActions, { canCreate: false, canUploadMom: true }));
    expect(html).toContain('Upload MOM');
    expect(html).not.toContain('Create Document');
    expect(permissionAllows(new Set(['documents.mom.upload']), employeeRouteRequirement('/employee/documents/generate'))).toBe(true);
  });

  it('keeps generator-only users able to create without seeing MOM', () => {
    const html = renderToStaticMarkup(createElement(OfficialDocumentActions, { canCreate: true, canUploadMom: false }));
    expect(html).toContain('Create Document');
    expect(html).not.toContain('Upload MOM');
  });

  it('hides both workflows and denies the route without either grant', () => {
    expect(renderToStaticMarkup(createElement(OfficialDocumentActions, { canCreate: false, canUploadMom: false }))).toBe('');
    expect(permissionAllows(new Set(['documents.employee.view']), employeeRouteRequirement('/employee/documents/generate'))).toBe(false);
  });
});

