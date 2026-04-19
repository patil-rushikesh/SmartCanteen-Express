import { createClient, RedisClientType } from 'redis';
import { CacheProvider } from '../../interfaces/cache-provider.js';
import { env } from '../../utils/env.js';

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

class RedisCacheProvider implements CacheProvider {
  constructor(private readonly client: RedisClientType) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, payload, { EX: ttlSeconds });
      return;
    }

    await this.client.set(key, payload);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

class UninitializedCacheProvider implements CacheProvider {
  private throwNotInitialized(): never {
    throw new Error('Cache provider not initialized. Redis connection must be established before cache usage.');
  }

  async get<T>(_key: string): Promise<T | null> {
    this.throwNotInitialized();
  }

  async set<T>(_key: string, _value: T, _ttlSeconds?: number): Promise<void> {
    this.throwNotInitialized();
  }

  async del(_key: string): Promise<void> {
    this.throwNotInitialized();
  }
}

let redisClient: RedisClientType | null = null;
export let cacheProvider: CacheProvider = new UninitializedCacheProvider();

export const initializeCacheProvider = async (): Promise<void> => {
  if (redisClient?.isOpen) {
    cacheProvider = new RedisCacheProvider(redisClient);
    return;
  }

  redisClient = createClient({
    url: env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        const delay = Math.min(100 * 2 ** retries, env.REDIS_RECONNECT_MAX_DELAY_MS);
        return delay;
      }
    }
  });

  redisClient.on('ready', () => console.log('[Redis] Connection ready'));
  redisClient.on('reconnecting', () => console.warn('[Redis] Reconnecting...'));
  redisClient.on('error', (error) => console.error('[Redis] Client error:', error));
  redisClient.on('end', () => console.warn('[Redis] Connection closed'));

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= env.REDIS_CONNECT_RETRIES; attempt += 1) {
    try {
      await redisClient.connect();
      cacheProvider = new RedisCacheProvider(redisClient);
      return;
    } catch (error) {
      lastError = error as Error;

      if (attempt < env.REDIS_CONNECT_RETRIES) {
        const waitMs = env.REDIS_CONNECT_BASE_DELAY_MS * 2 ** (attempt - 1);
        console.warn(`[Redis] Connect attempt ${attempt}/${env.REDIS_CONNECT_RETRIES} failed. Retrying in ${waitMs}ms.`);
        await sleep(waitMs);
      }
    }
  }

  throw new Error(
    `[Redis] Unable to establish connection after ${env.REDIS_CONNECT_RETRIES} attempts: ${lastError?.message ?? 'Unknown error'}`
  );
};

export const shutdownCacheProvider = async (): Promise<void> => {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }

  redisClient = null;
  cacheProvider = new UninitializedCacheProvider();
};

export const cacheKeys = {
  cart: (tenantId: string, userId: string) => `cart:${tenantId}:${userId}`,
  qr: (tenantId: string, orderId: string) => `qr:${tenantId}:${orderId}`
};
