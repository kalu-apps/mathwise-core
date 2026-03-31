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

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
