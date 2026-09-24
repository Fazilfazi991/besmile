import Link from 'next/link';
import { createElement } from 'react';

export function OfficialDocumentActions({ canCreate, canUploadMom }: { canCreate: boolean; canUploadMom: boolean }) {
  if (!canCreate && !canUploadMom) return null;

  return createElement('div', { className: 'flex flex-wrap gap-2' },
    canCreate && createElement(Link, { className: 'btn btn-primary', href: '/employee/documents/generate' }, 'Create Document'),
    canUploadMom && createElement(Link, { className: 'btn border', href: '/employee/documents/generate#mom-upload' }, 'Upload MOM'),
  );
}
