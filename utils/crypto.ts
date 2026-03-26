import crypto from 'crypto';

export const createSha256Hash = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

export const createHmacSha256 = (value: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(value).digest('hex');

export const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
