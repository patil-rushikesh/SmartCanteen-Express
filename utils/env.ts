import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z.string().default('development'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
  DATABASE_URL: z.string().min(1),
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
  CLOUDINARY_CLOUD_NAME: z.string().default('demo'),
  CLOUDINARY_API_KEY: z.string().default('cloudinary-key'),
  CLOUDINARY_API_SECRET: z.string().default('cloudinary-secret'),
  CLOUDINARY_FOLDER: z.string().default('smart-canteen'),
  REDIS_URL: z.string().optional(),
}).superRefine((config, context) => {
  if (config.APP_ENV !== 'production') return;
  const requireValue = (valid: boolean, key: string, message: string) => {
    if (!valid) context.addIssue({ code: 'custom', path: [key], message });
  };
  const secrets = [config.JWT_ACCESS_SECRET, config.JWT_REFRESH_SECRET, config.JWT_QR_SECRET];
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_QR_SECRET'] as const) {
    requireValue(config[key].length >= 32 && !config[key].startsWith('smart-canteen-'), key, 'Use a unique random secret of at least 32 characters');
  }
  requireValue(new Set(secrets).size === 3, 'JWT_ACCESS_SECRET', 'JWT secrets must be distinct');
  requireValue(config.PAYMENT_PROVIDER_MODE === 'razorpay', 'PAYMENT_PROVIDER_MODE', 'Production requires real payments');
  requireValue(config.RAZORPAY_KEY_ID.startsWith('rzp_live_'), 'RAZORPAY_KEY_ID', 'Production requires a live Razorpay key');
  requireValue(config.RAZORPAY_KEY_SECRET !== 'rzp_test_secret' && config.RAZORPAY_KEY_SECRET.length >= 16, 'RAZORPAY_KEY_SECRET', 'Configure payment secret');
  requireValue(config.RAZORPAY_WEBHOOK_SECRET !== 'razorpay-webhook-secret' && config.RAZORPAY_WEBHOOK_SECRET.length >= 16, 'RAZORPAY_WEBHOOK_SECRET', 'Configure webhook secret');
  requireValue(config.REDIS_URL?.startsWith('rediss://') === true, 'REDIS_URL', 'Production requires shared Redis over TLS');
  requireValue(config.CORS_ORIGIN.split(',').every(origin => {
    try { const url = new URL(origin.trim()); return url.protocol === 'https:' && url.origin === origin.trim(); }
    catch { return false; }
  }), 'CORS_ORIGIN', 'Use explicit HTTPS origins');
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
