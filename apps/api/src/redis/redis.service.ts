import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createClient, type RedisClientType } from "redis";
import { getApiRuntimeConfig } from "../config/runtime.config";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly client: RedisClientType = createClient({
    url: this.runtimeConfig.redisUrl,
  });
  private readonly subscriberClients = new Set<RedisClientType>();

  async onModuleInit() {
    await this.client.connect();
    await this.client.ping();
  }

  async onModuleDestroy() {
    await Promise.all(
      Array.from(this.subscriberClients).map(async (subscriber) => {
        if (subscriber.isOpen) {
          await subscriber.quit();
        }
      })
    );
    this.subscriberClients.clear();
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSec?: number): Promise<void> {
    if (ttlSec && ttlSec > 0) {
      await this.client.set(key, value, { EX: ttlSec });
      return;
    }
    await this.client.set(key, value);
  }

  async setIfAbsent(key: string, value: string, ttlSec: number): Promise<boolean> {
    const ttl = Math.max(1, Math.floor(ttlSec));
    const result = await this.client.set(key, value, { EX: ttl, NX: true });
    return result === "OK";
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.client.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      {
        keys: [key],
        arguments: [token],
      }
    );
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incrementWithTtl(key: string, ttlSec: number): Promise<number> {
    const next = await this.client.incr(key);
    if (next === 1) {
      await this.client.expire(key, Math.max(1, Math.floor(ttlSec)));
    }
    return next;
  }

  async increment(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async pushCappedList(
    key: string,
    value: string,
    limit: number,
    ttlSec: number
  ): Promise<void> {
    const normalizedLimit = Math.max(1, Math.floor(limit));
    await this.client.lPush(key, value);
    await this.client.lTrim(key, 0, normalizedLimit - 1);
    await this.client.expire(key, Math.max(1, Math.floor(ttlSec)));
  }

  async listRange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lRange(key, start, stop);
  }

  async subscribe(
    channel: string,
    handler: (message: string) => void
  ): Promise<() => Promise<void>> {
    const subscriber = this.client.duplicate();
    await subscriber.connect();
    this.subscriberClients.add(subscriber);
    await subscriber.subscribe(channel, handler);

    return async () => {
      this.subscriberClients.delete(subscriber);
      if (!subscriber.isOpen) return;
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    };
  }
}
