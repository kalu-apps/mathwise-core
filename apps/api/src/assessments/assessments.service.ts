import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { AssessmentsRepository } from "./assessments.repository";
import type {
  AssessmentSessionsMapDto,
  AssessmentStateRecordDto,
} from "./assessments.types";

const STATE_ROW_ID = "state";
const SESSIONS_ROW_ID = "sessions";

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const normalizeObjectArrayRecord = (value: unknown): Record<string, unknown[]> => {
  const source = asObject(value);
  if (!source) return {};
  const entries = Object.entries(source)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, items]) => [key, Array.isArray(items) ? items : []] as const);
  return Object.fromEntries(entries);
};

const normalizeAttempts = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return [];
  const dedupe = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    const attempt = asObject(item);
    if (!attempt) continue;
    const id = typeof attempt.id === "string" ? attempt.id.trim() : "";
    const studentId =
      typeof attempt.studentId === "string" ? attempt.studentId.trim() : "";
    if (!id || !studentId) continue;
    dedupe.set(id, attempt);
  }
  return [...dedupe.values()];
};

const normalizeSessions = (value: unknown): AssessmentSessionsMapDto => {
  const source = asObject(value);
  if (!source) return {};
  const result: AssessmentSessionsMapDto = {};
  for (const [key, session] of Object.entries(source)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    const sessionObject = asObject(session);
    if (!sessionObject) continue;
    const studentId =
      typeof sessionObject.studentId === "string"
        ? sessionObject.studentId.trim()
        : "";
    if (!studentId) continue;
    result[normalizedKey] = sessionObject;
  }
  return result;
};

@Injectable()
export class AssessmentsService implements OnModuleInit {
  constructor(private readonly repository: AssessmentsRepository) {}

  async onModuleInit() {
    await this.repository.ensureSchema();
  }

  async getState(actorUser: AuthUserDto | null): Promise<AssessmentStateRecordDto> {
    const state = await this.readState();
    if (!actorUser) {
      return {
        ...state,
        attempts: [],
      };
    }
    if (actorUser.role === "teacher") {
      return state;
    }
    return {
      ...state,
      attempts: state.attempts.filter(
        (attempt) => attempt.studentId === actorUser.id
      ),
    };
  }

  async saveState(
    payload: unknown,
    actorUser: AuthUserDto | null
  ): Promise<AssessmentStateRecordDto> {
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const incoming = this.normalizeState(payload);
    const current = await this.readState();

    const nextState: AssessmentStateRecordDto =
      actorUser.role === "teacher"
        ? incoming
        : {
            templates: current.templates,
            courseContent: current.courseContent,
            courseBlocks: current.courseBlocks,
            attempts: this.mergeStudentAttempts({
              current: current.attempts,
              incoming: incoming.attempts,
              studentId: actorUser.id,
            }),
          };

    await this.repository.upsertPayload(STATE_ROW_ID, nextState);
    return this.getState(actorUser);
  }

  async getSessions(
    actorUser: AuthUserDto | null
  ): Promise<AssessmentSessionsMapDto> {
    const sessions = await this.readSessions();
    if (!actorUser) return {};
    if (actorUser.role === "teacher") return sessions;

    return Object.fromEntries(
      Object.entries(sessions).filter(
        ([, value]) => value.studentId === actorUser.id
      )
    );
  }

  async saveSessions(
    payload: unknown,
    actorUser: AuthUserDto | null
  ): Promise<AssessmentSessionsMapDto> {
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const incoming = normalizeSessions(payload);
    const current = await this.readSessions();

    const next: AssessmentSessionsMapDto =
      actorUser.role === "teacher"
        ? incoming
        : {
            ...Object.fromEntries(
              Object.entries(current).filter(
                ([, value]) => value.studentId !== actorUser.id
              )
            ),
            ...Object.fromEntries(
              Object.entries(incoming).filter(
                ([, value]) => value.studentId === actorUser.id
              )
            ),
          };

    await this.repository.upsertPayload(SESSIONS_ROW_ID, next);
    return this.getSessions(actorUser);
  }

  private async readState(): Promise<AssessmentStateRecordDto> {
    const raw = await this.repository.getPayload(STATE_ROW_ID);
    return this.normalizeState(raw);
  }

  private async readSessions(): Promise<AssessmentSessionsMapDto> {
    const raw = await this.repository.getPayload(SESSIONS_ROW_ID);
    return normalizeSessions(raw);
  }

  private normalizeState(payload: unknown): AssessmentStateRecordDto {
    const source = asObject(payload);
    if (!source) {
      return {
        templates: [],
        courseContent: {},
        courseBlocks: {},
        attempts: [],
      };
    }

    return {
      templates: Array.isArray(source.templates) ? source.templates : [],
      courseContent: normalizeObjectArrayRecord(source.courseContent),
      courseBlocks: normalizeObjectArrayRecord(source.courseBlocks),
      attempts: normalizeAttempts(source.attempts),
    };
  }

  private mergeStudentAttempts(params: {
    current: Array<Record<string, unknown>>;
    incoming: Array<Record<string, unknown>>;
    studentId: string;
  }): Array<Record<string, unknown>> {
    const others = params.current.filter(
      (attempt) => attempt.studentId !== params.studentId
    );

    const mine = new Map<string, Record<string, unknown>>();
    for (const attempt of params.current) {
      if (attempt.studentId !== params.studentId) continue;
      if (typeof attempt.id !== "string") continue;
      mine.set(attempt.id, attempt);
    }
    for (const attempt of params.incoming) {
      if (attempt.studentId !== params.studentId) continue;
      if (typeof attempt.id !== "string") continue;
      mine.set(attempt.id, attempt);
    }

    return [...others, ...mine.values()];
  }
}
