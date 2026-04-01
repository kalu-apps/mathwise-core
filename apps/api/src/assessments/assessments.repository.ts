import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";

type StateRow = {
  payload: unknown;
};

@Injectable()
export class AssessmentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS assessments_state_store (
        id TEXT PRIMARY KEY,
        payload_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async getPayload(id: string): Promise<unknown | null> {
    const rows = await this.databaseService.query<StateRow>(
      `
        SELECT payload_json AS payload
        FROM assessments_state_store
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );
    return rows[0]?.payload ?? null;
  }

  async upsertPayload(id: string, payload: unknown): Promise<void> {
    await this.databaseService.execute(
      `
        INSERT INTO assessments_state_store (
          id,
          payload_json,
          updated_at
        )
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          payload_json = EXCLUDED.payload_json,
          updated_at = NOW()
      `,
      [id, JSON.stringify(payload)]
    );
  }
}
