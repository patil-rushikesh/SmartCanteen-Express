export interface UploadFileResult {
  fileUrl: string;
  fileKey: string;
}

export interface StorageProvider {
  uploadFile(buffer: Buffer, key: string, contentType: string): Promise<UploadFileResult>;
  deleteFile(fileKey: string): Promise<void>;
}
