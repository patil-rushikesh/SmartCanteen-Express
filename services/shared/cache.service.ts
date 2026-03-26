import { createClient, RedisClientType } from 'redis';
import { CacheProvider } from '../../interfaces/cache-provider.js';
import { env } from '../../utils/env.js';

class InMemoryCacheProvider implements CacheProvider {
  private readonly store = new Map<string, { expiresAt?: number; value: unknown }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

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

let redisClient: RedisClientType | null = null;

const createCacheProvider = (): CacheProvider => {
  if (!env.REDIS_URL) {
    return new InMemoryCacheProvider();
  }

  redisClient = createClient({ url: env.REDIS_URL });
  redisClient.on('error', (error) => console.error('Redis error:', error));
  redisClient.connect().catch((error) => {
    console.error('Redis connect failed, using in-memory cache fallback:', error);
  });

  return new RedisCacheProvider(redisClient);
};

export const cacheProvider = createCacheProvider();

export const cacheKeys = {
  cart: (tenantId: string, userId: string) => `cart:${tenantId}:${userId}`,
  qr: (tenantId: string, orderId: string) => `qr:${tenantId}:${orderId}`
};
