export interface UploadFileInput {
  file: string;
  folder: string;
  publicId?: string;
}

export interface UploadFileResult {
  fileUrl: string;
  fileKey: string;
}

export interface StorageProvider {
  uploadFile(input: UploadFileInput): Promise<UploadFileResult>;
  deleteFile(fileKey: string): Promise<void>;
}
