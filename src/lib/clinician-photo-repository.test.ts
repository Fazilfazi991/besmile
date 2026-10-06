import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { storage: { from: () => ({ upload: mocks.upload }) }, rpc: mocks.rpc } }));
import { clinicianRepository } from './clinician-repository';
beforeEach(() => { vi.clearAllMocks(); mocks.upload.mockResolvedValue({error:null}); mocks.rpc.mockResolvedValue({data:'saved',error:null}); });
describe('clinician photo repository', () => {
  it('keeps text-only patch free of avatar fields and never uploads', async () => {
    await clinicianRepository.saveProfile('doctor',{full_name:'QA',qualification:'MSc'});
    expect(mocks.rpc).toHaveBeenCalledWith('save_clinician_profile',{target_doctor:'doctor',patch:{full_name:'QA',qualification:'MSc'}});
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('normalizes safe JPEG MIME aliases and uses the real linked profile folder', async () => {
    const file=new File([new Uint8Array([255,216,255,224])],'photo.jpeg',{type:'image/jpg'});
    const path=await clinicianRepository.photo('linked-profile',file);
    expect(path).toMatch(/^linked-profile\/.+\.jpg$/);
    expect(mocks.upload).toHaveBeenCalledWith(path,file,{contentType:'image/jpeg'});
  });
  it('rejects unlinked upload before format validation', async () => {
    await expect(clinicianRepository.photo(null,new File([],'missing.jpg'))).rejects.toThrow('Create/link the clinician account before uploading a profile photo.');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('keeps storage details out of the upload error', async () => {
    mocks.upload.mockResolvedValue({error:{message:'private bucket/storage details'}});
    await expect(clinicianRepository.photo('profile',new File([new Uint8Array([255,216,255,224])],'photo.jpg',{type:'image/jpeg'}))).rejects.toThrow('Profile photo could not be uploaded. Please try again.');
  });
  it('rejects renamed non-image content before any upload', async () => {
    await expect(clinicianRepository.photo('profile',new File(['html'],'photo.jpg'))).rejects.toThrow('The selected image could not be read. Choose another photo.');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
