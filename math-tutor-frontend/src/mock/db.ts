import fs from "fs";
import path from "path";
import type { Course } from "../entities/course/model/types";
import type { Lesson } from "../entities/lesson/model/types";
import type { Purchase } from "../entities/purchase/model/types";
import type { LessonProgress } from "../entities/progress/model/types";
import type { User } from "../entities/user/model/types";
import type { TeacherProfile } from "../features/teacher-profile/model/types";
import type { Booking } from "../entities/booking/model/types";
import type { NewsPost } from "../entities/news/model/types";
import type {
  AssessmentSession,
  AssessmentStorageState,
} from "../features/assessments/model/types";
import type {
  AuthAuditRecord,
  AuthCredentialRecord,
  AuthOneTimeCodeRecord,
  AuthSessionRecord,
  BookingLifecycleRecord,
  CheckoutProcess,
  ConsentRecord,
  EntitlementRecord,
  IdempotencyRecord,
  IdentityRecord,
  OutboxRecord,
  PasswordResetTokenRecord,
  PaymentEventRecord,
  SupportActionRecord,
} from "../domain/auth-payments/model/types";

type StoredUser = User & { password: string };
type RumTelemetryRecord = {
  id: string;
  type: string;
  payload: string;
  createdAt: string;
  route?: string;
  userId?: string | null;
};

export type ChatThreadRecord = {
  id: string;
  teacherId: string;
  studentId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageId?: string | null;
  studentLastReadAt?: string | null;
  teacherLastReadAt?: string | null;
};

export type ChatMessageRecord = {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: "student" | "teacher";
  text: string;
  createdAt: string;
  editedAt?: string | null;
  attachments?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    url: string;
  }>;
  deletedForAll?: boolean;
  deletedForUserIds?: string[];
};

export type WorkbookSessionKind = "PERSONAL" | "CLASS";
export type WorkbookSessionStatus = "draft" | "in_progress" | "ended";
export type WorkbookParticipantRole = "teacher" | "student";

export type WorkbookSessionRecord = {
  id: string;
  kind: WorkbookSessionKind;
  createdBy: string;
  status: WorkbookSessionStatus;
  title: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  lastActivityAt: string;
  context?: string | null;
};

export type WorkbookSessionParticipantRecord = {
  sessionId: string;
  userId: string;
  roleInSession: WorkbookParticipantRole;
  permissions: string;
  joinedAt: string;
  leftAt?: string | null;
  isActive: boolean;
  lastSeenAt?: string | null;
};

export type WorkbookDraftRecord = {
  id: string;
  ownerUserId: string;
  sessionId: string;
  title: string;
  statusForCard: "draft" | "in_progress" | "ended";
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string | null;
  previewAssetId?: string | null;
};

export type WorkbookInviteRecord = {
  id: string;
  sessionId: string;
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string | null;
  maxUses?: number | null;
  useCount: number;
  revokedAt?: string | null;
};

export type WorkbookEventRecord = {
  id: string;
  sessionId: string;
  seq: number;
  authorUserId: string;
  type: string;
  payload: string;
  createdAt: string;
};

export type WorkbookSnapshotRecord = {
  id: string;
  sessionId: string;
  layer: "board" | "annotations";
  version: number;
  payload: string;
  createdAt: string;
};

export type AssistantSessionRecord = {
  id: string;
  userId: string;
  role: "student" | "teacher";
  mode:
    | "study-cabinet"
    | "course"
    | "lesson"
    | "whiteboard"
    | "teacher-dashboard"
    | "test-library";
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantMessageRecord = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  blocks?: string | null;
  createdAt: string;
};

export type AssistantEventRecord = {
  id: string;
  userId: string;
  type:
    | "course_purchased"
    | "lesson_opened"
    | "lesson_completed"
    | "test_submitted"
    | "whiteboard_session_started"
    | "assistant_action_clicked";
  payload: string;
  createdAt: string;
};

export type MockDb = {
  users: StoredUser[];
  courses: Course[];
  lessons: Lesson[];
  purchases: Purchase[];
  progress: LessonProgress[];
  teacherProfiles: Record<string, TeacherProfile>;
  teacherAvailability: Record<
    string,
    { id: string; date: string; startTime: string; endTime: string }[]
  >;
  bookings: Booking[];
  news: NewsPost[];
  checkoutProcesses: CheckoutProcess[];
  entitlements: EntitlementRecord[];
  identity: IdentityRecord[];
  consents: ConsentRecord[];
  bookingLifecycle: BookingLifecycleRecord[];
  paymentEvents: PaymentEventRecord[];
  outbox: OutboxRecord[];
  supportActions: SupportActionRecord[];
  authSessions: AuthSessionRecord[];
  authCredentials: AuthCredentialRecord[];
  authOneTimeCodes: AuthOneTimeCodeRecord[];
  passwordResetTokens: PasswordResetTokenRecord[];
  authAudit: AuthAuditRecord[];
  idempotency: IdempotencyRecord[];
  rumTelemetry: RumTelemetryRecord[];
  chatThreads: ChatThreadRecord[];
  chatMessages: ChatMessageRecord[];
  workbookSessions: WorkbookSessionRecord[];
  workbookParticipants: WorkbookSessionParticipantRecord[];
  workbookDrafts: WorkbookDraftRecord[];
  workbookInvites: WorkbookInviteRecord[];
  workbookEvents: WorkbookEventRecord[];
  workbookSnapshots: WorkbookSnapshotRecord[];
  assistantSessions: AssistantSessionRecord[];
  assistantMessages: AssistantMessageRecord[];
  assistantEvents: AssistantEventRecord[];
  assessments: AssessmentStorageState;
  assessmentSessions: Record<string, AssessmentSession>;
};

const DB_FILE = path.resolve(process.cwd(), "mock-db.json");

const createDefaultDb = (): MockDb => ({
  users: [],
  courses: [],
  lessons: [],
  purchases: [],
  progress: [],
  teacherProfiles: {},
  teacherAvailability: {},
  bookings: [],
  news: [],
  checkoutProcesses: [],
  entitlements: [],
  identity: [],
  consents: [],
  bookingLifecycle: [],
  paymentEvents: [],
  outbox: [],
  supportActions: [],
  authSessions: [],
  authCredentials: [],
  authOneTimeCodes: [],
  passwordResetTokens: [],
  authAudit: [],
  idempotency: [],
  rumTelemetry: [],
  chatThreads: [],
  chatMessages: [],
  workbookSessions: [],
  workbookParticipants: [],
  workbookDrafts: [],
  workbookInvites: [],
  workbookEvents: [],
  workbookSnapshots: [],
  assistantSessions: [],
  assistantMessages: [],
  assistantEvents: [],
  assessments: {
    templates: [],
    courseContent: {},
    courseBlocks: {},
    attempts: [],
  },
  assessmentSessions: {},
});

let db: MockDb | null = null;

function readDbFile(): MockDb {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const fresh = createDefaultDb();
      fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw) as MockDb;
    const base = createDefaultDb();
    const merged = { ...base, ...parsed };
    return {
      ...merged,
      assessments: {
        ...base.assessments,
        ...(parsed.assessments ?? {}),
      },
      assessmentSessions: parsed.assessmentSessions ?? {},
    };
  } catch {
    return createDefaultDb();
  }
}

export function getDb(): MockDb {
  if (!db) db = readDbFile();
  return db;
}

export function saveDb() {
  if (!db) return;
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function resetDb() {
  db = createDefaultDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
