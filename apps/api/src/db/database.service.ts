import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, type QueryResultRow } from "pg";
import { getApiRuntimeConfig } from "../config/runtime.config";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly pool = new Pool({
    connectionString: this.runtimeConfig.databaseUrl,
  });

  async onModuleInit() {
    await this.pool.query("SELECT 1");
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async query<T extends QueryResultRow>(
    text: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  async execute(text: string, params: unknown[] = []): Promise<void> {
    await this.pool.query(text, params);
  }
}
