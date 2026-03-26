import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16).default('smart-canteen-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(16).default('smart-canteen-refresh-secret'),
  JWT_QR_SECRET: z.string().min(16).default('smart-canteen-qr-secret'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  QR_TTL_MINUTES: z.coerce.number().min(15).max(30).default(20),
  ORDER_DELAY_MINUTES: z.coerce.number().min(5).default(20),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),
  RAZORPAY_KEY_ID: z.string().default('rzp_test_key'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_test_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('razorpay-webhook-secret'),
  CLOUDINARY_CLOUD_NAME: z.string().default('demo'),
  CLOUDINARY_API_KEY: z.string().default('cloudinary-key'),
  CLOUDINARY_API_SECRET: z.string().default('cloudinary-secret'),
  CLOUDINARY_FOLDER: z.string().default('smart-canteen'),
  REDIS_URL: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
