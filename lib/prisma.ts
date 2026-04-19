import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './prisma-client.js';
import { env } from '../utils/env.js';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required and must be provided via environment variables.');
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      max: env.DATABASE_POOL_MAX
    }),
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const connectPrismaWithRetry = async (): Promise<void> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= env.DATABASE_CONNECT_RETRIES; attempt += 1) {
    try {
      await prisma.$connect();
      return;
    } catch (error) {
      lastError = error as Error;

      if (attempt < env.DATABASE_CONNECT_RETRIES) {
        const waitMs = env.DATABASE_CONNECT_BASE_DELAY_MS * 2 ** (attempt - 1);
        console.warn(
          `[Database] Connection attempt ${attempt}/${env.DATABASE_CONNECT_RETRIES} failed. Retrying in ${waitMs}ms.`
        );
        await sleep(waitMs);
      }
    }
  }

  throw new Error(
    `[Database] Unable to connect after ${env.DATABASE_CONNECT_RETRIES} attempts: ${lastError?.message ?? 'Unknown error'}`
  );
};

export const disconnectPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};
