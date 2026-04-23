import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type {
  TeacherChatAttachmentDto,
  TeacherChatMessageDto,
  TeacherChatThreadDto,
  TeacherChatVoiceMessageDto,
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
  voiceMessage: unknown;
  voiceListenedByPeer: boolean;
  deletedForAll: boolean;
};

type ThreadIdentityRow = {
  id: string;
  studentId: string;
  teacherId: string;
};

const normalizeAttachments = (value: unknown): TeacherChatAttachmentDto[] => {
  if (!Array.isArray(value)) return [];
  return value.reduce<TeacherChatAttachmentDto[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const candidate = item as {
      id?: unknown;
      name?: unknown;
      mimeType?: unknown;
      size?: unknown;
      url?: unknown;
      mediaObjectId?: unknown;
    };
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      typeof candidate.mimeType !== "string"
    ) {
      return acc;
    }
    const mediaObjectId =
      typeof candidate.mediaObjectId === "string"
        ? candidate.mediaObjectId.trim()
        : "";
    const url =
      typeof candidate.url === "string" ? candidate.url.trim() : "";
    if (!url && !mediaObjectId) {
      return acc;
    }
    const size =
      typeof candidate.size === "number" && Number.isFinite(candidate.size)
        ? Math.max(0, Math.floor(candidate.size))
        : 0;
    acc.push({
      id: candidate.id,
      name: candidate.name,
      mimeType: candidate.mimeType,
      size,
      url,
      mediaObjectId: mediaObjectId || undefined,
    });
    return acc;
  }, []);
};

const isAudioMimeType = (mimeType: string) =>
  mimeType.toLowerCase().startsWith("audio/");

const normalizeVoiceWaveform = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    .map((item) => Math.max(0, Math.min(100, Math.round(item))))
    .slice(0, 96);
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeVoiceMessage = (
  value: unknown
): Omit<TeacherChatVoiceMessageDto, "listenedByPeer"> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as {
    id?: unknown;
    mimeType?: unknown;
    size?: unknown;
    url?: unknown;
    mediaObjectId?: unknown;
    durationSeconds?: unknown;
    waveform?: unknown;
    listenedByPeer?: unknown;
  };
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const mimeType =
    typeof candidate.mimeType === "string" ? candidate.mimeType.trim() : "";
  const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
  const mediaObjectId =
    typeof candidate.mediaObjectId === "string"
      ? candidate.mediaObjectId.trim()
      : "";
  if (!id || !mimeType || (!url && !mediaObjectId)) return undefined;
  const size =
    typeof candidate.size === "number" && Number.isFinite(candidate.size)
      ? Math.max(0, Math.floor(candidate.size))
      : 0;
  const durationSeconds =
    typeof candidate.durationSeconds === "number" &&
    Number.isFinite(candidate.durationSeconds) &&
    candidate.durationSeconds > 0
      ? Math.max(0, Number(candidate.durationSeconds))
      : undefined;
  return {
    id,
    mimeType,
    size,
    url,
    mediaObjectId: mediaObjectId || undefined,
    durationSeconds,
    waveform: normalizeVoiceWaveform(candidate.waveform),
  };
};

const extractLegacyVoice = (
  attachments: TeacherChatAttachmentDto[]
): {
  attachments: TeacherChatAttachmentDto[];
  voice?: Omit<TeacherChatVoiceMessageDto, "listenedByPeer">;
} => {
  const index = attachments.findIndex((attachment) =>
    isAudioMimeType(attachment.mimeType)
  );
  if (index < 0) {
    return {
      attachments,
      voice: undefined as TeacherChatVoiceMessageDto | undefined,
    };
  }
  const legacy = attachments[index];
  if (!legacy) {
    return {
      attachments,
      voice: undefined as TeacherChatVoiceMessageDto | undefined,
    };
  }
  return {
    attachments: attachments.filter((_, attachmentIndex) => attachmentIndex !== index),
    voice: {
      id: legacy.id,
      mimeType: legacy.mimeType,
      size: legacy.size,
      url: legacy.url,
      mediaObjectId: legacy.mediaObjectId,
    },
  };
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

const mapMessageRow = (row: MessageRow): TeacherChatMessageDto => {
  const normalizedAttachments = normalizeAttachments(row.attachments);
  const explicitVoice = normalizeVoiceMessage(row.voiceMessage);
  const legacy = explicitVoice
    ? { attachments: normalizedAttachments, voice: explicitVoice }
    : extractLegacyVoice(normalizedAttachments);
  const voice = legacy.voice
    ? {
        ...legacy.voice,
        listenedByPeer: row.voiceListenedByPeer,
      }
    : undefined;
  return {
    id: row.id,
    threadId: row.threadId,
    senderId: row.senderId,
    senderRole: row.senderRole,
    senderName: row.senderName,
    senderPhoto: row.senderPhoto ?? undefined,
    text: row.text,
    createdAt: row.createdAt,
    editedAt: row.editedAt ?? undefined,
    attachments: legacy.attachments,
    voice,
    deletedForAll: row.deletedForAll,
    readByPeer: Boolean(voice?.listenedByPeer),
  };
};

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
        voice_message_json JSONB,
        voice_listened_by_peer BOOLEAN NOT NULL DEFAULT FALSE,
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
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS voice_message_json JSONB
    `);
    await this.databaseService.execute(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS voice_listened_by_peer BOOLEAN NOT NULL DEFAULT FALSE
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
            CASE
              WHEN NULLIF(BTRIM(text), '') IS NOT NULL THEN text
              WHEN voice_message_json IS NOT NULL
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(COALESCE(attachments_json, '[]'::jsonb)) AS attachment
                  WHERE LOWER(COALESCE(attachment->>'mimeType', '')) LIKE 'audio/%'
                )
                THEN 'Голосовое сообщение'
              WHEN jsonb_typeof(COALESCE(attachments_json, '[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(attachments_json, '[]'::jsonb)) > 0
                THEN 'Вложение'
              ELSE ''
            END AS text,
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
            CASE
              WHEN NULLIF(BTRIM(text), '') IS NOT NULL THEN text
              WHEN voice_message_json IS NOT NULL
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(COALESCE(attachments_json, '[]'::jsonb)) AS attachment
                  WHERE LOWER(COALESCE(attachment->>'mimeType', '')) LIKE 'audio/%'
                )
                THEN 'Голосовое сообщение'
              WHEN jsonb_typeof(COALESCE(attachments_json, '[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(attachments_json, '[]'::jsonb)) > 0
                THEN 'Вложение'
              ELSE ''
            END AS text,
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
          voice_message_json AS "voiceMessage",
          voice_listened_by_peer AS "voiceListenedByPeer",
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
          voice_message_json AS "voiceMessage",
          voice_listened_by_peer AS "voiceListenedByPeer",
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
    voice?: TeacherChatVoiceMessageDto;
    voiceListenedByPeer?: boolean;
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
          voice_message_json,
          voice_listened_by_peer,
          deleted_for_all,
          created_at,
          edited_at,
          updated_at_ts
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10,
          FALSE, $11, NULL, NOW()
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
        JSON.stringify(params.voice ?? null),
        params.voiceListenedByPeer ?? false,
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
    voice?: TeacherChatVoiceMessageDto;
    voiceListenedByPeer?: boolean;
    editedAt: string;
  }): Promise<TeacherChatMessageDto | null> {
    await this.databaseService.execute(
      `
        UPDATE chat_messages
        SET
          text = $2,
          attachments_json = $3::jsonb,
          voice_message_json = $4::jsonb,
          voice_listened_by_peer = $5,
          edited_at = $6,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [
        params.id,
        params.text,
        JSON.stringify(params.attachments ?? []),
        JSON.stringify(params.voice ?? null),
        params.voiceListenedByPeer ?? false,
        params.editedAt,
      ]
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
          voice_message_json = NULL,
          voice_listened_by_peer = FALSE,
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

  async markVoiceListenedByPeer(params: {
    id: string;
  }): Promise<TeacherChatMessageDto | null> {
    await this.databaseService.execute(
      `
        UPDATE chat_messages
        SET
          voice_listened_by_peer = TRUE,
          updated_at_ts = NOW()
        WHERE id = $1
          AND deleted_for_all = FALSE
          AND (
            voice_message_json IS NOT NULL
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(attachments_json, '[]'::jsonb)) AS attachment
              WHERE LOWER(COALESCE(attachment->>'mimeType', '')) LIKE 'audio/%'
            )
          )
      `,
      [params.id]
    );
    const message = await this.findMessageById(params.id);
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
