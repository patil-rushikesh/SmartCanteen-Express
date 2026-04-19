import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider, UploadFileResult } from '../../interfaces/storage-provider.js';
import { env } from '../../utils/env.js';

const encodeS3Key = (key: string): string => key.split('/').map((segment) => encodeURIComponent(segment)).join('/');

class S3StorageProvider implements StorageProvider {
  private readonly client = new S3Client({ region: process.env.AWS_REGION });

  private getPublicUrl(key: string): string {
    const encodedKey = encodeS3Key(key);
    if (env.S3_PUBLIC_BASE_URL) {
      return `${env.S3_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${encodedKey}`;
    }

    const region = process.env.AWS_REGION;
    if (!region || region === 'us-east-1') {
      return `https://${env.S3_BUCKET}.s3.amazonaws.com/${encodedKey}`;
    }

    return `https://${env.S3_BUCKET}.s3.${region}.amazonaws.com/${encodedKey}`;
  }

  async uploadFile(buffer: Buffer, key: string, contentType: string): Promise<UploadFileResult> {
    await this.client.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }));

    const fileUrl = env.S3_URL_MODE === 'presigned'
      ? await getSignedUrl(
          this.client,
          new GetObjectCommand({
            Bucket: env.S3_BUCKET,
            Key: key
          }),
          { expiresIn: env.S3_PRESIGNED_URL_TTL_SECONDS }
        )
      : this.getPublicUrl(key);

    return {
      fileUrl,
      fileKey: key
    };
  }

  async deleteFile(fileKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: fileKey
    }));
  }
}

export const storageProvider = new S3StorageProvider();
