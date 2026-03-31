import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createClient, type RedisClientType } from "redis";
import { getApiRuntimeConfig } from "../config/runtime.config";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly client: RedisClientType = createClient({
    url: this.runtimeConfig.redisUrl,
  });

  async onModuleInit() {
    await this.client.connect();
    await this.client.ping();
  }

  async onModuleDestroy() {
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
}
