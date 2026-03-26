import { v2 as cloudinary } from 'cloudinary';
import { StorageProvider, UploadFileInput, UploadFileResult } from '../../interfaces/storage-provider.js';
import { env } from '../../utils/env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET
});

class CloudinaryStorageProvider implements StorageProvider {
  async uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
    const response = await cloudinary.uploader.upload(input.file, {
      folder: input.folder,
      public_id: input.publicId
    });

    return {
      fileUrl: response.secure_url,
      fileKey: response.public_id
    };
  }

  async deleteFile(fileKey: string): Promise<void> {
    await cloudinary.uploader.destroy(fileKey);
  }
}

export const storageProvider = new CloudinaryStorageProvider();
