import { describe, expect, it } from 'vitest';
import { patientDocumentKey } from './storage/storage-service';
import { validatePatientDocument } from './patient-document-rules';
describe('patient document safety', () => {
  it('rejects invalid type and oversized files', () => { expect(() => validatePatientDocument({name:'a.exe',type:'application/octet-stream',size:2})).toThrow(); expect(() => validatePatientDocument({name:'a.pdf',type:'application/pdf',size:21*1024*1024})).toThrow(); });
  it('uses opaque storage keys', () => { const key=patientDocumentKey('patient-id','document-id',1,'pdf'); expect(key).toContain('patients/patient-id/documents/document-id/v1/'); expect(key).not.toContain('Jane'); });
});
