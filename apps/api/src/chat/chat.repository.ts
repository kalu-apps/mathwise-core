import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type {
  TeacherChatAttachmentDto,
  TeacherChatMessageDto,
  TeacherChatThreadDto,
} from "./chat.types";

type ThreadRow = {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  studentPhoto: string | null;
  teacherId: string;
  teacherName: string | null;
  teacherPhoto: string | null;
  updatedAt: string;
  createdAt: string;
  lastMessageText: string | null;
  lastMessageAt: string | null;
};

type MessageRow = {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: "student" | "teacher";
  senderName: string;
  senderPhoto: string | null;
  text: string;
  createdAt: string;
  editedAt: string | null;
  attachments: unknown;
  deletedForAll: boolean;
};

type ThreadIdentityRow = {
  id: string;
  studentId: string;
  teacherId: string;
};

const normalizeAttachments = (value: unknown): TeacherChatAttachmentDto[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as {
        id?: unknown;
        name?: unknown;
        mimeType?: unknown;
        size?: unknown;
        url?: unknown;
      };
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string" ||
        typeof candidate.mimeType !== "string" ||
        typeof candidate.url !== "string"
      ) {
        return null;
      }
      const size =
        typeof candidate.size === "number" && Number.isFinite(candidate.size)
          ? Math.max(0, Math.floor(candidate.size))
          : 0;
      return {
        id: candidate.id,
        name: candidate.name,
        mimeType: candidate.mimeType,
        size,
        url: candidate.url,
      } satisfies TeacherChatAttachmentDto;
    })
    .filter((item): item is TeacherChatAttachmentDto => Boolean(item));
};

const mapThreadRow = (row: ThreadRow): TeacherChatThreadDto => ({
  id: row.id,
  studentId: row.studentId,
  studentName: row.studentName?.trim() || "Студент",
  studentEmail: row.studentEmail?.trim() || "—",
  studentPhoto: row.studentPhoto ?? undefined,
  teacherId: row.teacherId,
  teacherName: row.teacherName?.trim() || "Преподаватель",
  teacherPhoto: row.teacherPhoto ?? undefined,
  updatedAt: row.updatedAt,
  createdAt: row.createdAt,
  lastMessageText: row.lastMessageText ?? undefined,
  lastMessageAt: row.lastMessageAt ?? undefined,
  unreadCount: 0,
});

const mapMessageRow = (row: MessageRow): TeacherChatMessageDto => ({
  id: row.id,
  threadId: row.threadId,
  senderId: row.senderId,
  senderRole: row.senderRole,
  senderName: row.senderName,
  senderPhoto: row.senderPhoto ?? undefined,
  text: row.text,
  createdAt: row.createdAt,
  editedAt: row.editedAt ?? undefined,
  attachments: normalizeAttachments(row.attachments),
  deletedForAll: row.deletedForAll,
  readByPeer: false,
});

@Injectable()
export class ChatRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        teacher_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (student_id, teacher_id)
      )
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_chat_threads_student
      ON chat_threads (student_id, updated_at DESC)
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_chat_threads_teacher
      ON chat_threads (teacher_id, updated_at DESC)
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_role TEXT NOT NULL CHECK (sender_role IN ('student', 'teacher')),
        sender_name TEXT NOT NULL,
        sender_photo TEXT,
        text TEXT NOT NULL DEFAULT '',
        attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        deleted_for_all BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TEXT NOT NULL,
        edited_at TEXT,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.databaseService.execute(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await this.databaseService.execute(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS deleted_for_all BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await this.databaseService.execute(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS sender_photo TEXT
    `);
    await this.databaseService.execute(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS edited_at TEXT
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread
      ON chat_messages (thread_id, created_at ASC)
    `);
  }

  async findThreadById(threadId: string): Promise<ThreadIdentityRow | null> {
    const rows = await this.databaseService.query<ThreadIdentityRow>(
      `
        SELECT
          id,
          student_id AS "studentId",
          teacher_id AS "teacherId"
        FROM chat_threads
        WHERE id = $1
        LIMIT 1
      `,
      [threadId]
    );
    return rows[0] ?? null;
  }

  async findThreadByParticipants(params: {
    studentId: string;
    teacherId: string;
  }): Promise<ThreadIdentityRow | null> {
    const rows = await this.databaseService.query<ThreadIdentityRow>(
      `
        SELECT
          id,
          student_id AS "studentId",
          teacher_id AS "teacherId"
        FROM chat_threads
        WHERE student_id = $1
          AND teacher_id = $2
        LIMIT 1
      `,
      [params.studentId, params.teacherId]
    );
    return rows[0] ?? null;
  }

  async insertThread(params: {
    id: string;
    studentId: string;
    teacherId: string;
    createdAt: string;
  }): Promise<void> {
    await this.databaseService.execute(
      `
        INSERT INTO chat_threads (
          id,
          student_id,
          teacher_id,
          created_at,
          updated_at,
          updated_at_ts
        )
        VALUES ($1, $2, $3, $4, $4, NOW())
        ON CONFLICT (student_id, teacher_id)
        DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          updated_at_ts = NOW()
      `,
      [params.id, params.studentId, params.teacherId, params.createdAt]
    );
  }

  async listThreadsForStudent(studentId: string): Promise<TeacherChatThreadDto[]> {
    const rows = await this.databaseService.query<ThreadRow>(
      `
        SELECT
          t.id,
          t.student_id AS "studentId",
          su.first_name || ' ' || su.last_name AS "studentName",
          su.email AS "studentEmail",
          su.photo AS "studentPhoto",
          t.teacher_id AS "teacherId",
          tu.first_name || ' ' || tu.last_name AS "teacherName",
          tu.photo AS "teacherPhoto",
          t.updated_at AS "updatedAt",
          t.created_at AS "createdAt",
          lm.text AS "lastMessageText",
          lm.created_at AS "lastMessageAt"
        FROM chat_threads t
        LEFT JOIN auth_users su
          ON su.id = t.student_id
        LEFT JOIN auth_users tu
          ON tu.id = t.teacher_id
        LEFT JOIN LATERAL (
          SELECT
            text,
            created_at
          FROM chat_messages m
          WHERE m.thread_id = t.id
            AND m.deleted_for_all = FALSE
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) lm ON TRUE
        WHERE t.student_id = $1
        ORDER BY COALESCE(lm.created_at, t.updated_at) DESC, t.id DESC
      `,
      [studentId]
    );
    return rows.map((row) => mapThreadRow(row));
  }

  async listThreadsForTeacher(teacherId: string): Promise<TeacherChatThreadDto[]> {
    const rows = await this.databaseService.query<ThreadRow>(
      `
        SELECT
          t.id,
          t.student_id AS "studentId",
          su.first_name || ' ' || su.last_name AS "studentName",
          su.email AS "studentEmail",
          su.photo AS "studentPhoto",
          t.teacher_id AS "teacherId",
          tu.first_name || ' ' || tu.last_name AS "teacherName",
          tu.photo AS "teacherPhoto",
          t.updated_at AS "updatedAt",
          t.created_at AS "createdAt",
          lm.text AS "lastMessageText",
          lm.created_at AS "lastMessageAt"
        FROM chat_threads t
        LEFT JOIN auth_users su
          ON su.id = t.student_id
        LEFT JOIN auth_users tu
          ON tu.id = t.teacher_id
        LEFT JOIN LATERAL (
          SELECT
            text,
            created_at
          FROM chat_messages m
          WHERE m.thread_id = t.id
            AND m.deleted_for_all = FALSE
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) lm ON TRUE
        WHERE t.teacher_id = $1
        ORDER BY COALESCE(lm.created_at, t.updated_at) DESC, t.id DESC
      `,
      [teacherId]
    );
    return rows.map((row) => mapThreadRow(row));
  }

  async listMessagesByThread(threadId: string): Promise<TeacherChatMessageDto[]> {
    const rows = await this.databaseService.query<MessageRow>(
      `
        SELECT
          id,
          thread_id AS "threadId",
          sender_id AS "senderId",
          sender_role AS "senderRole",
          sender_name AS "senderName",
          sender_photo AS "senderPhoto",
          text,
          created_at AS "createdAt",
          edited_at AS "editedAt",
          attachments_json AS attachments,
          deleted_for_all AS "deletedForAll"
        FROM chat_messages
        WHERE thread_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [threadId]
    );
    return rows.map((row) => mapMessageRow(row));
  }

  async findMessageById(messageId: string): Promise<TeacherChatMessageDto | null> {
    const rows = await this.databaseService.query<MessageRow>(
      `
        SELECT
          id,
          thread_id AS "threadId",
          sender_id AS "senderId",
          sender_role AS "senderRole",
          sender_name AS "senderName",
          sender_photo AS "senderPhoto",
          text,
          created_at AS "createdAt",
          edited_at AS "editedAt",
          attachments_json AS attachments,
          deleted_for_all AS "deletedForAll"
        FROM chat_messages
        WHERE id = $1
        LIMIT 1
      `,
      [messageId]
    );
    const row = rows[0];
    return row ? mapMessageRow(row) : null;
  }

  async insertMessage(params: {
    id: string;
    threadId: string;
    senderId: string;
    senderRole: "student" | "teacher";
    senderName: string;
    senderPhoto?: string;
    text: string;
    attachments: TeacherChatAttachmentDto[];
    createdAt: string;
  }): Promise<TeacherChatMessageDto> {
    await this.databaseService.execute(
      `
        INSERT INTO chat_messages (
          id,
          thread_id,
          sender_id,
          sender_role,
          sender_name,
          sender_photo,
          text,
          attachments_json,
          deleted_for_all,
          created_at,
          edited_at,
          updated_at_ts
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
          FALSE, $9, NULL, NOW()
        )
      `,
      [
        params.id,
        params.threadId,
        params.senderId,
        params.senderRole,
        params.senderName,
        params.senderPhoto ?? null,
        params.text,
        JSON.stringify(params.attachments ?? []),
        params.createdAt,
      ]
    );
    await this.touchThread(params.threadId, params.createdAt);
    const message = await this.findMessageById(params.id);
    if (!message) {
      throw new Error("chat_message_create_failed");
    }
    return message;
  }

  async updateMessage(params: {
    id: string;
    text: string;
    attachments: TeacherChatAttachmentDto[];
    editedAt: string;
  }): Promise<TeacherChatMessageDto | null> {
    await this.databaseService.execute(
      `
        UPDATE chat_messages
        SET
          text = $2,
          attachments_json = $3::jsonb,
          edited_at = $4,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [params.id, params.text, JSON.stringify(params.attachments ?? []), params.editedAt]
    );
    const message = await this.findMessageById(params.id);
    if (!message) return null;
    await this.touchThread(message.threadId, params.editedAt);
    return message;
  }

  async markMessageDeletedForAll(params: {
    id: string;
    editedAt: string;
  }): Promise<TeacherChatMessageDto | null> {
    await this.databaseService.execute(
      `
        UPDATE chat_messages
        SET
          text = '',
          attachments_json = '[]'::jsonb,
          deleted_for_all = TRUE,
          edited_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [params.id, params.editedAt]
    );
    const message = await this.findMessageById(params.id);
    if (!message) return null;
    await this.touchThread(message.threadId, params.editedAt);
    return message;
  }

  async clearThreadMessages(threadId: string, clearedAt: string): Promise<void> {
    await this.databaseService.execute(
      `
        DELETE FROM chat_messages
        WHERE thread_id = $1
      `,
      [threadId]
    );
    await this.touchThread(threadId, clearedAt);
  }

  async touchThread(threadId: string, updatedAt: string): Promise<void> {
    await this.databaseService.execute(
      `
        UPDATE chat_threads
        SET
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [threadId, updatedAt]
    );
  }
}
