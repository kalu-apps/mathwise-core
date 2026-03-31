import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getApiRuntimeConfig } from "../config/runtime.config";

export type DatabaseExecutor = {
  query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  execute(text: string, params?: unknown[]): Promise<void>;
};

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

  async transaction<T>(
    callback: (executor: DatabaseExecutor) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const executor: DatabaseExecutor = {
        query: async <R extends QueryResultRow>(text: string, params: unknown[] = []) => {
          const result = await client.query<R>(text, params);
          return result.rows;
        },
        execute: async (text: string, params: unknown[] = []) => {
          await client.query(text, params);
        },
      };
      const result = await callback(executor);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async safeRollback(client: PoolClient) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // no-op
    }
  }
}
