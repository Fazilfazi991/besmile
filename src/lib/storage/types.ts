export type UploadFileInput = { bucket: string; storageKey: string; file: File | Blob; contentType: string };
export type StoredFileResult = { storageKey: string; bucket: string };
export interface StorageProvider {
  uploadFile(input: UploadFileInput): Promise<StoredFileResult>;
  createSignedDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(storageKey: string): Promise<void>;
  moveFile?(sourceKey: string, destinationKey: string): Promise<void>;
}
