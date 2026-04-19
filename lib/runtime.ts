import { connectPrismaWithRetry, disconnectPrisma } from './prisma.js';
import { initializeCacheProvider, shutdownCacheProvider } from '../services/shared/cache.service.js';

let initialized = false;

export const initializeRuntime = async (): Promise<void> => {
  if (initialized) {
    return;
  }

  await connectPrismaWithRetry();
  await initializeCacheProvider();
  initialized = true;
};

export const shutdownRuntime = async (): Promise<void> => {
  if (!initialized) {
    return;
  }

  await shutdownCacheProvider();
  await disconnectPrisma();
  initialized = false;
};
