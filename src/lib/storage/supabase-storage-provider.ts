import type { StorageProvider, UploadFileInput, StoredFileResult } from './types';
export class SupabaseStorageProvider implements StorageProvider {
  constructor(private client: any, private bucket: string) {}
  async uploadFile(input: UploadFileInput): Promise<StoredFileResult> {
    const { error } = await this.client.storage.from(input.bucket).upload(input.storageKey, input.file, { contentType: input.contentType, upsert: false });
    if (error) throw new Error('Unable to store document.');
    return { storageKey: input.storageKey, bucket: input.bucket };
  }
  async createSignedDownloadUrl(storageKey: string, expiresInSeconds = 120) {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(storageKey, Math.min(Math.max(expiresInSeconds, 60), 300));
    if (error || !data?.signedUrl) throw new Error('Unable to prepare document access.');
    return data.signedUrl;
  }
  async deleteFile(storageKey: string) { const { error } = await this.client.storage.from(this.bucket).remove([storageKey]); if (error) throw new Error('Unable to delete stored document.'); }
  async moveFile(sourceKey: string, destinationKey: string) { const { error } = await this.client.storage.from(this.bucket).move(sourceKey, destinationKey); if (error) throw new Error('Unable to move stored document.'); }
}
