import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  TRUST_PROXY: z.string().default('true'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DATABASE_CONNECT_RETRIES: z.coerce.number().int().min(1).default(5),
  DATABASE_CONNECT_BASE_DELAY_MS: z.coerce.number().int().min(100).default(500),
  REDIS_URL: z.string().min(1),
  REDIS_CONNECT_RETRIES: z.coerce.number().int().min(1).default(5),
  REDIS_CONNECT_BASE_DELAY_MS: z.coerce.number().int().min(100).default(500),
  REDIS_RECONNECT_MAX_DELAY_MS: z.coerce.number().int().min(100).default(3000),
  JWT_ACCESS_SECRET: z.string().min(16).default('smart-canteen-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(16).default('smart-canteen-refresh-secret'),
  JWT_QR_SECRET: z.string().min(16).default('smart-canteen-qr-secret'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  QR_TTL_MINUTES: z.coerce.number().min(15).max(30).default(20),
  ORDER_DELAY_MINUTES: z.coerce.number().min(5).default(20),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),
  PAYMENT_PROVIDER_MODE: z.enum(['razorpay', 'fake']).default('razorpay'),
  RAZORPAY_KEY_ID: z.string().default('rzp_test_key'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_test_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('razorpay-webhook-secret'),
  AWS_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_KEY_PREFIX: z.string().default('smart-canteen'),
  S3_URL_MODE: z.enum(['public', 'presigned']).default('public'),
  S3_PRESIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(604800).default(3600),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
