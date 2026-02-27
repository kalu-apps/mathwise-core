import crypto from "crypto";
import os from "os";
import path from "path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { promises as fsPromises } from "node:fs";
import type { ViteDevServer } from "vite";
import {
  getDb,
  saveDb,
  resetDb,
  type ChatMessageRecord,
  type ChatThreadRecord,
  type WorkbookDraftRecord,
  type WorkbookEventRecord,
  type WorkbookInviteRecord,
  type WorkbookSessionParticipantRecord,
  type WorkbookSessionRecord,
  type WorkbookSnapshotRecord,
} from "./db";
import {
  buildCourseOutlinePayload,
  buildLessonDraftPayload,
  createAssistantSessionBundle,
  getAssistantSessionBundle,
  getStudentRecommendationPayload,
  getTeacherInsightsPayload,
  respondWithAssistant,
  trackAssistantEvent,
} from "./modules/assistant/assistant.orchestrator";
import type { Course } from "../entities/course/model/types";
import type { Lesson } from "../entities/lesson/model/types";
import type { Purchase } from "../entities/purchase/model/types";
import type {
  NewsPost,
  NewsTone,
  NewsVisibility,
} from "../entities/news/model/types";
import type {
  AssistantPlatformEventRequest,
  AssistantRespondRequest,
  AssistantSessionCreateRequest,
  AuthoringCourseOutlineRequest,
  AuthoringLessonDraftRequest,
} from "../shared/api/assistant-contracts";
import { TEACHER_EMAILS } from "../features/auth/model/constants";
import type {
  AuthAuditAction,
  AuthCredentialRecord,
  AuthOneTimeCodeRecord,
  AuthSessionRecord,
  BookingLifecycleRecord,
  CheckoutProcess,
  CheckoutMethod,
  CheckoutState,
  ConsentRecord,
  ConsentScope,
  EntitlementRecord,
  IdempotencyRecord,
  IdentityRecord,
  IdentityState,
  OutboxRecord,
  OutboxTemplate,
  PasswordResetTokenRecord,
  PaymentEventOutcome,
  PaymentEventProvider,
  PaymentEventRecord,
  PaymentEventStatus,
  ReconciliationIssueCode,
  SupportActionRecord,
  SupportActionType,
  TrialBookingState,
} from "../domain/auth-payments/model/types";
import {
  assertBookingTransition,
  assertCheckoutTransition,
  assertEntitlementTransition,
  assertIdentityTransition,
} from "../domain/auth-payments/model/stateMachine";
import { initiateCheckoutPayment } from "../domain/auth-payments/model/paymentGateway";
import { createEmailRuntimeConfig } from "./notifications/email/providerFactory";
import type {
  BnplPurchaseData,
  BnplProvider,
  BnplScheduleStatus,
  PurchasePaymentMethod,
} from "../entities/purchase/model/types";
import { buildBnplMockPurchaseData } from "../entities/purchase/model/bnplMockAdapter";
import {
  createEmptyAssessmentsState,
  type AssessmentSession,
  type AssessmentStorageState,
} from "../features/assessments/model/types";

const json = (res: import("http").ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
};

const readBody = async (req: import("http").IncomingMessage) => {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  if (!body) return null;
  return JSON.parse(body);
};

const readRawBody = async (req: import("http").IncomingMessage) => {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  return body;
};

const safeUser = (user: { password: string } & Record<string, unknown>) => {
  const { password, ...safe } = user;
  void password;
  return safe;
};

const ensureId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2, 10)}`;

const ASSESSMENT_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const normalizeAssessmentState = (
  state: AssessmentStorageState | null | undefined
): AssessmentStorageState => {
  const fallback = createEmptyAssessmentsState();
  if (!state || typeof state !== "object") {
    return fallback;
  }
  return {
    templates: Array.isArray(state.templates) ? state.templates : [],
    courseContent:
      state.courseContent && typeof state.courseContent === "object"
        ? state.courseContent
        : {},
    courseBlocks:
      state.courseBlocks && typeof state.courseBlocks === "object"
        ? state.courseBlocks
        : {},
    attempts: Array.isArray(state.attempts) ? state.attempts : [],
  };
};

const pruneAssessmentSessions = (
  sessions: Record<string, AssessmentSession>,
  nowMs: number = Date.now()
) =>
  Object.fromEntries(
    Object.entries(sessions).filter(([, session]) => {
      const updatedAtMs = Date.parse(session.updatedAt);
      if (!Number.isFinite(updatedAtMs)) return false;
      return nowMs - updatedAtMs <= ASSESSMENT_SESSION_TTL_MS;
    })
  );

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizePasswordInput = (value: unknown) =>
  typeof value === "string" ? value.normalize("NFKC") : "";

const hashPassword = (rawPassword: string) => {
  const password = normalizePasswordInput(rawPassword);
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(
    `${password}:${AUTH_PASSWORD_PEPPER}`,
    salt,
    64,
    { N: 16384, r: 8, p: 1 }
  );
  return `scrypt-v1$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
};

const verifyPasswordHash = (rawPassword: string, storedHash?: string) => {
  if (!storedHash || typeof storedHash !== "string") return false;
  const [algo, nRaw, rRaw, pRaw, saltHex, digestHex] = storedHash.split("$");
  if (
    algo !== "scrypt-v1" ||
    !nRaw ||
    !rRaw ||
    !pRaw ||
    !saltHex ||
    !digestHex
  ) {
    return false;
  }
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  try {
    const password = normalizePasswordInput(rawPassword);
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(digestHex, "hex");
    const derived = crypto.scryptSync(
      `${password}:${AUTH_PASSWORD_PEPPER}`,
      salt,
      expected.length,
      { N, r, p }
    );
    if (expected.length !== derived.length) return false;
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
};

const validatePasswordPolicy = (rawPassword: string) => {
  const password = normalizePasswordInput(rawPassword);
  if (password.length < 10) {
    return "Пароль должен содержать минимум 10 символов.";
  }
  if (password.length > 64) {
    return "Пароль слишком длинный. Используйте до 64 символов.";
  }
  if (/\s/.test(password)) {
    return "Пароль не должен содержать пробелы.";
  }
  if (!/^[\x21-\x7E]+$/.test(password)) {
    return "Используйте только латиницу, цифры и специальные символы.";
  }
  if (!/[a-z]/.test(password)) {
    return "Добавьте хотя бы одну строчную букву.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Добавьте хотя бы одну заглавную букву.";
  }
  if (!/\d/.test(password)) {
    return "Добавьте хотя бы одну цифру.";
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return "Добавьте хотя бы один специальный символ.";
  }
  return null;
};

const hashPasswordResetToken = (rawToken: string) =>
  crypto
    .createHash("sha256")
    .update(`${rawToken}:${AUTH_PASSWORD_PEPPER}`)
    .digest("hex");

const hashAuthCode = (rawCode: string) =>
  crypto
    .createHash("sha256")
    .update(`${rawCode}:${AUTH_PASSWORD_PEPPER}`)
    .digest("hex");

const generateOneTimeCode = () =>
  String(Math.floor(100000 + Math.random() * 900000));

const toIsoFromNow = (deltaMs: number, base = nowTs()) =>
  new Date(base + deltaMs).toISOString();

const serializeAuditMetadata = (value: unknown) => {
  if (value === undefined) return undefined;
  try {
    const raw = JSON.stringify(value);
    return raw.length > 2000 ? raw.slice(0, 2000) : raw;
  } catch {
    return undefined;
  }
};

const safeStringify = (value: unknown) => {
  try {
    const raw = JSON.stringify(value);
    return raw.length > 8000 ? raw.slice(0, 8000) : raw;
  } catch {
    return "{}";
  }
};

const normalizePhoneStorage = (value: unknown) => {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  let normalized = digits;
  if (normalized.startsWith("8")) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (!normalized.startsWith("7")) {
    normalized = `7${normalized}`;
  }
  normalized = normalized.slice(0, 11);
  if (normalized.length !== 11) return "";

  return `+${normalized}`;
};

const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
};

const hasValidTimeRange = (startTime: string, endTime: string) => {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
};

const toStartTimestamp = (date: string, startTime: string) =>
  new Date(`${date}T${startTime}`).getTime();

const isFutureDateTime = (date: string, startTime: string) => {
  const timestamp = toStartTimestamp(date, startTime);
  return Number.isFinite(timestamp) && timestamp > Date.now();
};

const overlaps = (
  startA: string,
  endA: string,
  startB: string,
  endB: string
) => {
  const aStart = toMinutes(startA);
  const aEnd = toMinutes(endA);
  const bStart = toMinutes(startB);
  const bEnd = toMinutes(endB);
  if (
    !Number.isFinite(aStart) ||
    !Number.isFinite(aEnd) ||
    !Number.isFinite(bStart) ||
    !Number.isFinite(bEnd)
  ) {
    return false;
  }
  return aStart < bEnd && bStart < aEnd;
};

type AvailabilityRecord = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};

const isAvailabilityRecord = (
  slot: Partial<AvailabilityRecord> | null | undefined
): slot is AvailabilityRecord =>
  typeof slot?.id === "string" &&
  typeof slot?.date === "string" &&
  typeof slot?.startTime === "string" &&
  typeof slot?.endTime === "string" &&
  hasValidTimeRange(slot.startTime, slot.endTime) &&
  isFutureDateTime(slot.date, slot.startTime);

const sanitizeAvailabilitySlots = (
  slots: Array<Partial<AvailabilityRecord> | null | undefined>
): AvailabilityRecord[] =>
  slots
    .filter(isAvailabilityRecord)
    .map((slot) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }))
    .sort(
      (a, b) =>
        toStartTimestamp(a.date, a.startTime) -
        toStartTimestamp(b.date, b.startTime)
    );

const hasSameAvailability = (
  prev: Array<Partial<AvailabilityRecord> | null | undefined>,
  next: AvailabilityRecord[]
) =>
  prev.length === next.length &&
  prev.every((slot, index) => {
    const other = next[index];
    return (
      slot?.id === other?.id &&
      slot?.date === other?.date &&
      slot?.startTime === other?.startTime &&
      slot?.endTime === other?.endTime
    );
  });

const pruneTeacherAvailability = (db: ReturnType<typeof getDb>) => {
  let mutated = false;
  Object.entries(db.teacherAvailability ?? {}).forEach(([teacherId, slots]) => {
    const currentSlots = Array.isArray(slots) ? slots : [];
    const nextSlots = sanitizeAvailabilitySlots(currentSlots);
    if (!hasSameAvailability(currentSlots, nextSlots)) {
      db.teacherAvailability[teacherId] = nextSlots;
      mutated = true;
    }
  });
  if (mutated) {
    saveDb();
  }
};

const normalizeBookingRecords = (db: ReturnType<typeof getDb>) => {
  let mutated = false;
  db.bookings = db.bookings.map((booking) => {
    const lessonKind = booking.lessonKind === "trial" ? "trial" : "regular";
    const paymentStatus = booking.paymentStatus === "paid" ? "paid" : "unpaid";
    if (
      booking.lessonKind === lessonKind &&
      booking.paymentStatus === paymentStatus
    ) {
      return booking;
    }
    mutated = true;
    return {
      ...booking,
      lessonKind,
      paymentStatus,
    };
  });
  if (mutated) {
    saveDb();
  }
};

const pruneWorkbookArtifacts = (db: ReturnType<typeof getDb>) => {
  let mutated = false;
  const nowMs = nowTs();

  const validSessionIds = new Set(db.workbookSessions.map((session) => session.id));

  const prevParticipantsLength = db.workbookParticipants.length;
  db.workbookParticipants = db.workbookParticipants.filter((participant) =>
    validSessionIds.has(participant.sessionId)
  );
  mutated = mutated || db.workbookParticipants.length !== prevParticipantsLength;

  const prevDraftsLength = db.workbookDrafts.length;
  db.workbookDrafts = db.workbookDrafts.filter((draft) =>
    validSessionIds.has(draft.sessionId)
  );
  mutated = mutated || db.workbookDrafts.length !== prevDraftsLength;

  const prevEventsLength = db.workbookEvents.length;
  db.workbookEvents = db.workbookEvents.filter((event) =>
    validSessionIds.has(event.sessionId)
  );
  mutated = mutated || db.workbookEvents.length !== prevEventsLength;

  const prevSnapshotsLength = db.workbookSnapshots.length;
  db.workbookSnapshots = db.workbookSnapshots.filter((snapshot) =>
    validSessionIds.has(snapshot.sessionId)
  );
  mutated = mutated || db.workbookSnapshots.length !== prevSnapshotsLength;

  const prevInvitesLength = db.workbookInvites.length;
  db.workbookInvites = db.workbookInvites.filter((invite) => {
    if (!validSessionIds.has(invite.sessionId)) return false;
    if (invite.revokedAt) return false;
    if (isWorkbookInviteExpired(invite, nowMs)) return false;
    if (
      typeof invite.maxUses === "number" &&
      invite.maxUses > 0 &&
      invite.useCount >= invite.maxUses
    ) {
      return false;
    }
    return true;
  });
  mutated = mutated || db.workbookInvites.length !== prevInvitesLength;

  if (mutated) {
    saveDb();
  }
};

const teacherEmailSet = new Set(
  TEACHER_EMAILS.map((email) => normalizeEmail(email)).filter(Boolean)
);
const primaryTeacherEmail = normalizeEmail(TEACHER_EMAILS[0] ?? "");
const canonicalizeTeacherLoginEmail = (email: string) =>
  teacherEmailSet.has(email) ? primaryTeacherEmail : email;
const LEGAL_DOCUMENT_VERSION = "ru-legal-v1";
const AUTH_SESSION_COOKIE = "mt_auth_session";
const AUTH_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const AUTH_SESSION_IDLE_TTL_MS = 1000 * 60 * 60;
const AUTH_PASSWORD_PEPPER = process.env.AUTH_PASSWORD_PEPPER ?? "mock-pepper-v1";
const AUTH_PASSWORD_MAX_FAILED_ATTEMPTS = 5;
const AUTH_PASSWORD_LOCK_MS = 1000 * 60 * 15;
const AUTH_PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;
const AUTH_MAGIC_CODE_TTL_MS = 1000 * 60 * 10;
const AUTH_MAGIC_CODE_MAX_ATTEMPTS = 5;
const EMAIL_RUNTIME = createEmailRuntimeConfig();
const AUTH_DEBUG_TOKENS = EMAIL_RUNTIME.allowAuthDebugTokens;
const OUTBOX_DEFAULT_MAX_ATTEMPTS = Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 4);
const CARD_WEBHOOK_SECRET = "mock-card-webhook-secret-v1";
const CARD_AUTO_CAPTURE = false;
const CHECKOUT_TTL_MS = 1000 * 60 * 30;
const IDEMPOTENCY_RECORD_TTL_MS = 1000 * 60 * 60 * 12;
const IDEMPOTENCY_HEADER_NAME = "x-idempotency-key";

const nowIso = () => new Date().toISOString();
const nowTs = () => Date.now();
const checkoutExpiresAt = (baseTimestamp = nowIso()) =>
  new Date(new Date(baseTimestamp).getTime() + CHECKOUT_TTL_MS).toISOString();

type TeacherChatEligibilityResult = {
  available: boolean;
  reason: "teacher" | "eligible" | "premium_or_booking_required" | "teacher_not_found";
  hasPremiumAccess: boolean;
  hasBookingAccess: boolean;
  teacher: ReturnType<typeof getDb>["users"][number] | null;
};

type SerializableChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};

const CHAT_MAX_ATTACHMENTS_PER_MESSAGE = 10;
const CHAT_MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024;
const WORKBOOK_INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const WORKBOOK_PRESENCE_TTL_MS = 1000 * 60;
const WORKBOOK_EVENT_LIMIT_PER_SESSION = 4000;
const WORKBOOK_PDF_RENDER_MAX_PAGES = 20;
const WORKBOOK_PDF_RENDER_MAX_BYTES = 15 * 1024 * 1024;
const execFileAsync = promisify(execFileCallback);

type WorkbookPermissionPayload = {
  canDraw: boolean;
  canAnnotate: boolean;
  canUseMedia: boolean;
  canUseChat: boolean;
  canInvite: boolean;
  canManageSession: boolean;
  canSelect: boolean;
  canDelete: boolean;
  canInsertImage: boolean;
  canClear: boolean;
  canExport: boolean;
  canUseLaser: boolean;
};

type WorkbookSessionSettingsPayload = {
  undoPolicy: "everyone" | "teacher_only" | "own_only";
  strictGeometry: boolean;
  smartInk: {
    mode: "off" | "basic" | "full";
    confidenceThreshold: number;
    smartShapes: boolean;
    smartTextOcr: boolean;
    smartMathOcr: boolean;
  };
  studentControls: {
    canDraw: boolean;
    canSelect: boolean;
    canDelete: boolean;
    canInsertImage: boolean;
    canClear: boolean;
    canExport: boolean;
    canUseLaser: boolean;
  };
};

const defaultWorkbookPermissions = (
  role: "teacher" | "student",
  kind: "PERSONAL" | "CLASS"
): WorkbookPermissionPayload => {
  const isTeacher = role === "teacher";
  if (kind === "PERSONAL") {
    return {
      canDraw: true,
      canAnnotate: true,
      canUseMedia: true,
      canUseChat: true,
      canInvite: false,
      canManageSession: isTeacher,
      canSelect: true,
      canDelete: true,
      canInsertImage: true,
      canClear: true,
      canExport: true,
      canUseLaser: true,
    };
  }
  return {
    canDraw: isTeacher,
    canAnnotate: isTeacher,
    canUseMedia: true,
    canUseChat: true,
    canInvite: isTeacher,
    canManageSession: isTeacher,
    canSelect: isTeacher,
    canDelete: isTeacher,
    canInsertImage: isTeacher,
    canClear: isTeacher,
    canExport: isTeacher,
    canUseLaser: isTeacher,
  };
};

const parseWorkbookPermissions = (
  raw: string | undefined,
  fallbackRole: "teacher" | "student",
  kind: "PERSONAL" | "CLASS"
): WorkbookPermissionPayload => {
  const fallback = defaultWorkbookPermissions(fallbackRole, kind);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkbookPermissionPayload>;
    return {
      canDraw: typeof parsed.canDraw === "boolean" ? parsed.canDraw : fallback.canDraw,
      canAnnotate:
        typeof parsed.canAnnotate === "boolean"
          ? parsed.canAnnotate
          : fallback.canAnnotate,
      canUseMedia:
        typeof parsed.canUseMedia === "boolean"
          ? parsed.canUseMedia
          : fallback.canUseMedia,
      canUseChat:
        typeof parsed.canUseChat === "boolean" ? parsed.canUseChat : fallback.canUseChat,
      canInvite:
        typeof parsed.canInvite === "boolean" ? parsed.canInvite : fallback.canInvite,
      canManageSession:
        typeof parsed.canManageSession === "boolean"
          ? parsed.canManageSession
          : fallback.canManageSession,
      canSelect:
        typeof parsed.canSelect === "boolean" ? parsed.canSelect : fallback.canSelect,
      canDelete:
        typeof parsed.canDelete === "boolean" ? parsed.canDelete : fallback.canDelete,
      canInsertImage:
        typeof parsed.canInsertImage === "boolean"
          ? parsed.canInsertImage
          : fallback.canInsertImage,
      canClear:
        typeof parsed.canClear === "boolean" ? parsed.canClear : fallback.canClear,
      canExport:
        typeof parsed.canExport === "boolean" ? parsed.canExport : fallback.canExport,
      canUseLaser:
        typeof parsed.canUseLaser === "boolean"
          ? parsed.canUseLaser
          : fallback.canUseLaser,
    };
  } catch {
    return fallback;
  }
};

const stringifyWorkbookPermissions = (permissions: WorkbookPermissionPayload) =>
  JSON.stringify(permissions);

const parseWorkbookPayload = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const stripWorkbookChatFromScenePayload = (value: string | null | undefined) => {
  const parsed = parseWorkbookPayload(value);
  if (!parsed || typeof parsed !== "object") {
    return typeof value === "string" && value.trim().length > 0
      ? value
      : safeStringify({});
  }
  const source = parsed as Record<string, unknown>;
  if (!Array.isArray(source.chat) || source.chat.length === 0) {
    return safeStringify(source);
  }
  return safeStringify({
    ...source,
    chat: [],
  });
};

const defaultWorkbookSettings = (): WorkbookSessionSettingsPayload => ({
  undoPolicy: "teacher_only",
  strictGeometry: false,
  smartInk: {
    mode: "basic",
    confidenceThreshold: 0.72,
    smartShapes: true,
    smartTextOcr: false,
    smartMathOcr: false,
  },
  studentControls: {
    canDraw: false,
    canSelect: false,
    canDelete: false,
    canInsertImage: false,
    canClear: false,
    canExport: false,
    canUseLaser: false,
  },
});

const parseWorkbookSettingsFromSession = (
  session: WorkbookSessionRecord
): WorkbookSessionSettingsPayload => {
  const fallback = defaultWorkbookSettings();
  if (!session.context) return fallback;
  const parsed = parseWorkbookPayload(session.context);
  if (!parsed || typeof parsed !== "object") return fallback;
  const source = parsed as {
    settings?: Partial<WorkbookSessionSettingsPayload>;
  };
  const settings = source.settings;
  if (!settings || typeof settings !== "object") return fallback;
  return {
    undoPolicy:
      settings.undoPolicy === "everyone" ||
      settings.undoPolicy === "teacher_only" ||
      settings.undoPolicy === "own_only"
        ? settings.undoPolicy
        : fallback.undoPolicy,
    strictGeometry:
      typeof settings.strictGeometry === "boolean"
        ? settings.strictGeometry
        : fallback.strictGeometry,
    smartInk: {
      mode:
        settings.smartInk?.mode === "off" ||
        settings.smartInk?.mode === "basic" ||
        settings.smartInk?.mode === "full"
          ? settings.smartInk.mode
          : fallback.smartInk.mode,
      confidenceThreshold:
        typeof settings.smartInk?.confidenceThreshold === "number" &&
        Number.isFinite(settings.smartInk.confidenceThreshold)
          ? Math.max(0.35, Math.min(0.98, settings.smartInk.confidenceThreshold))
          : fallback.smartInk.confidenceThreshold,
      smartShapes:
        typeof settings.smartInk?.smartShapes === "boolean"
          ? settings.smartInk.smartShapes
          : fallback.smartInk.smartShapes,
      smartTextOcr:
        typeof settings.smartInk?.smartTextOcr === "boolean"
          ? settings.smartInk.smartTextOcr
          : fallback.smartInk.smartTextOcr,
      smartMathOcr:
        typeof settings.smartInk?.smartMathOcr === "boolean"
          ? settings.smartInk.smartMathOcr
          : fallback.smartInk.smartMathOcr,
    },
    studentControls: {
      canDraw:
        typeof settings.studentControls?.canDraw === "boolean"
          ? settings.studentControls.canDraw
          : fallback.studentControls.canDraw,
      canSelect:
        typeof settings.studentControls?.canSelect === "boolean"
          ? settings.studentControls.canSelect
          : fallback.studentControls.canSelect,
      canDelete:
        typeof settings.studentControls?.canDelete === "boolean"
          ? settings.studentControls.canDelete
          : fallback.studentControls.canDelete,
      canInsertImage:
        typeof settings.studentControls?.canInsertImage === "boolean"
          ? settings.studentControls.canInsertImage
          : fallback.studentControls.canInsertImage,
      canClear:
        typeof settings.studentControls?.canClear === "boolean"
          ? settings.studentControls.canClear
          : fallback.studentControls.canClear,
      canExport:
        typeof settings.studentControls?.canExport === "boolean"
          ? settings.studentControls.canExport
          : fallback.studentControls.canExport,
      canUseLaser:
        typeof settings.studentControls?.canUseLaser === "boolean"
          ? settings.studentControls.canUseLaser
          : fallback.studentControls.canUseLaser,
    },
  };
};

const writeWorkbookSettingsToSession = (
  session: WorkbookSessionRecord,
  settings: WorkbookSessionSettingsPayload
) => {
  session.context = safeStringify({ settings });
};

const applyWorkbookStudentControls = (
  db: ReturnType<typeof getDb>,
  session: WorkbookSessionRecord,
  settings: WorkbookSessionSettingsPayload
) => {
  db.workbookParticipants = db.workbookParticipants.map((participant) => {
    if (participant.sessionId !== session.id) return participant;
    if (participant.roleInSession !== "student") return participant;
    const current = parseWorkbookPermissions(
      participant.permissions,
      "student",
      session.kind
    );
    const next: WorkbookPermissionPayload = {
      ...current,
      canDraw: settings.studentControls.canDraw,
      canSelect: settings.studentControls.canSelect,
      canDelete: settings.studentControls.canDelete,
      canInsertImage: settings.studentControls.canInsertImage,
      canClear: settings.studentControls.canClear,
      canExport: settings.studentControls.canExport,
      canUseLaser: settings.studentControls.canUseLaser,
    };
    return {
      ...participant,
      permissions: stringifyWorkbookPermissions(next),
    };
  });
};

const decodePdfDataUrl = (value: unknown): Buffer | null => {
  if (typeof value !== "string" || !value.startsWith("data:application/pdf;base64,")) {
    return null;
  }
  const base64 = value.slice("data:application/pdf;base64,".length).trim();
  if (!base64) return null;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
};

const readPngSize = (buffer: Buffer): { width: number; height: number } | null => {
  if (buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
};

const renderPdfPagesViaPoppler = async (params: {
  pdfBuffer: Buffer;
  dpi: number;
  maxPages: number;
}) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "workbook-pdf-"));
  const inputPath = path.join(tempRoot, "input.pdf");
  const outputPrefix = path.join(tempRoot, "page");
  await fsPromises.writeFile(inputPath, params.pdfBuffer);
  try {
    await execFileAsync("pdftoppm", [
      "-png",
      "-r",
      String(params.dpi),
      "-f",
      "1",
      "-l",
      String(params.maxPages),
      inputPath,
      outputPrefix,
    ]);
    const files = (await fsPromises.readdir(tempRoot))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const pages = await Promise.all(
      files.map(async (name, index) => {
        const absolute = path.join(tempRoot, name);
        const buffer = await fsPromises.readFile(absolute);
        const size = readPngSize(buffer);
        return {
          id: ensureId(),
          page: index + 1,
          imageUrl: `data:image/png;base64,${buffer.toString("base64")}`,
          width: size?.width,
          height: size?.height,
        };
      })
    );
    return pages;
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true });
  }
};

const sanitizeWorkbookTitle = (
  kind: "PERSONAL" | "CLASS",
  title: string | undefined,
  ownerDisplayName: string
) => {
  const normalized = (title ?? "").trim().slice(0, 120);
  if (normalized) return normalized;
  if (kind === "CLASS") return "Коллективный урок";
  return `Личная тетрадь • ${ownerDisplayName}`;
};

const getWorkbookSessionById = (db: ReturnType<typeof getDb>, sessionId: string) =>
  db.workbookSessions.find((session) => session.id === sessionId) ?? null;

const getWorkbookParticipants = (db: ReturnType<typeof getDb>, sessionId: string) =>
  db.workbookParticipants.filter((participant) => participant.sessionId === sessionId);

const getWorkbookParticipant = (
  db: ReturnType<typeof getDb>,
  sessionId: string,
  userId: string
) =>
  db.workbookParticipants.find(
    (participant) => participant.sessionId === sessionId && participant.userId === userId
  ) ?? null;

const isWorkbookParticipantOnline = (
  participant: WorkbookSessionParticipantRecord,
  nowMs = nowTs()
) => {
  if (!participant.isActive) return false;
  const lastSeenMs = Date.parse(participant.lastSeenAt ?? participant.joinedAt);
  if (!Number.isFinite(lastSeenMs)) return false;
  return nowMs - lastSeenMs <= WORKBOOK_PRESENCE_TTL_MS;
};

const ensureWorkbookDraft = (
  db: ReturnType<typeof getDb>,
  params: {
    ownerUserId: string;
    session: WorkbookSessionRecord;
    statusForCard?: "draft" | "in_progress" | "ended";
    timestamp?: string;
  }
) => {
  const timestamp = params.timestamp ?? nowIso();
  const existing =
    db.workbookDrafts.find(
      (draft) =>
        draft.ownerUserId === params.ownerUserId &&
        draft.sessionId === params.session.id
    ) ?? null;
  const statusForCard =
    params.statusForCard ??
    (params.session.status === "ended" ? "ended" : "in_progress");
  if (existing) {
    existing.title = params.session.title;
    existing.statusForCard = statusForCard;
    existing.updatedAt = timestamp;
    return existing;
  }
  const created: WorkbookDraftRecord = {
    id: ensureId(),
    ownerUserId: params.ownerUserId,
    sessionId: params.session.id,
    title: params.session.title,
    statusForCard,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: null,
    previewAssetId: null,
  };
  db.workbookDrafts.push(created);
  return created;
};

const touchWorkbookSessionActivity = (
  session: WorkbookSessionRecord,
  timestamp = nowIso()
) => {
  session.lastActivityAt = timestamp;
  if (session.status === "draft") {
    session.status = "in_progress";
    session.startedAt = session.startedAt ?? timestamp;
  }
};

const getNextWorkbookSeq = (db: ReturnType<typeof getDb>, sessionId: string) => {
  const latest = db.workbookEvents
    .filter((event) => event.sessionId === sessionId)
    .sort((a, b) => b.seq - a.seq)[0];
  return (latest?.seq ?? 0) + 1;
};

const appendWorkbookEvent = (
  db: ReturnType<typeof getDb>,
  params: {
    sessionId: string;
    authorUserId: string;
    type: string;
    payload: unknown;
    createdAt?: string;
  }
) => {
  const createdAt = params.createdAt ?? nowIso();
  const event: WorkbookEventRecord = {
    id: ensureId(),
    sessionId: params.sessionId,
    seq: getNextWorkbookSeq(db, params.sessionId),
    authorUserId: params.authorUserId,
    type: params.type,
    payload: safeStringify(params.payload),
    createdAt,
  };
  db.workbookEvents.push(event);
  const sessionEvents = db.workbookEvents.filter(
    (candidate) => candidate.sessionId === params.sessionId
  );
  if (sessionEvents.length > WORKBOOK_EVENT_LIMIT_PER_SESSION) {
    const overflow = sessionEvents.length - WORKBOOK_EVENT_LIMIT_PER_SESSION;
    const sorted = sessionEvents.sort((a, b) => a.seq - b.seq);
    const toDelete = new Set(sorted.slice(0, overflow).map((item) => item.id));
    db.workbookEvents = db.workbookEvents.filter((item) => !toDelete.has(item.id));
  }
  return event;
};

const upsertWorkbookSnapshot = (
  db: ReturnType<typeof getDb>,
  params: {
    sessionId: string;
    layer: "board" | "annotations";
    version: number;
    payload: unknown;
    timestamp?: string;
  }
) => {
  const timestamp = params.timestamp ?? nowIso();
  const existing =
    db.workbookSnapshots.find(
      (snapshot) =>
        snapshot.sessionId === params.sessionId && snapshot.layer === params.layer
    ) ?? null;
  if (existing) {
    existing.version = Math.max(existing.version, params.version);
    existing.payload = safeStringify(params.payload);
    existing.createdAt = timestamp;
    return existing;
  }
  const created: WorkbookSnapshotRecord = {
    id: ensureId(),
    sessionId: params.sessionId,
    layer: params.layer,
    version: params.version,
    payload: safeStringify(params.payload),
    createdAt: timestamp,
  };
  db.workbookSnapshots.push(created);
  return created;
};

const serializeWorkbookParticipant = (
  db: ReturnType<typeof getDb>,
  participant: WorkbookSessionParticipantRecord
) => {
  const user = db.users.find((candidate) => candidate.id === participant.userId);
  const session = getWorkbookSessionById(db, participant.sessionId);
  const fallbackRole = user?.role === "teacher" ? "teacher" : "student";
  const permissions = parseWorkbookPermissions(
    participant.permissions,
    fallbackRole,
    session?.kind ?? "PERSONAL"
  );
  return {
    userId: participant.userId,
    roleInSession: participant.roleInSession,
    displayName: toDisplayName(user),
    photo: user?.photo,
    isActive: participant.isActive,
    isOnline: isWorkbookParticipantOnline(participant),
    lastSeenAt: participant.lastSeenAt ?? null,
    permissions,
  };
};

const serializeWorkbookSession = (
  db: ReturnType<typeof getDb>,
  session: WorkbookSessionRecord,
  actor: { id: string; role: "student" | "teacher" }
) => {
  const participants = getWorkbookParticipants(db, session.id);
  const actorParticipant = participants.find(
    (participant) => participant.userId === actor.id
  );
  const actorPermissions = parseWorkbookPermissions(
    actorParticipant?.permissions,
    actor.role,
    session.kind
  );
  const settings = parseWorkbookSettingsFromSession(session);
  return {
    id: session.id,
    kind: session.kind,
    status: session.status,
    title: session.title,
    createdBy: session.createdBy,
    createdAt: session.createdAt,
    startedAt: session.startedAt ?? null,
    endedAt: session.endedAt ?? null,
    lastActivityAt: session.lastActivityAt,
    canInvite: actorPermissions.canInvite,
    canEdit: session.status !== "ended" && actorPermissions.canDraw,
    roleInSession: actorParticipant?.roleInSession ?? actor.role,
    participants: participants.map((participant) =>
      serializeWorkbookParticipant(db, participant)
    ),
    settings,
  };
};

const serializeWorkbookDraftCard = (
  db: ReturnType<typeof getDb>,
  draft: WorkbookDraftRecord,
  actor: { id: string; role: "student" | "teacher" }
) => {
  const session = getWorkbookSessionById(db, draft.sessionId);
  if (!session) return null;
  const participants = getWorkbookParticipants(db, session.id);
  const actorParticipant = participants.find(
    (participant) => participant.userId === actor.id
  );
  const permissions = parseWorkbookPermissions(
    actorParticipant?.permissions,
    actor.role,
    session.kind
  );
  const startedAt = session.startedAt ?? null;
  const endedAt = session.endedAt ?? null;
  const durationMs =
    startedAt && endedAt ? Date.parse(endedAt) - Date.parse(startedAt) : Number.NaN;
  const durationMinutes =
    Number.isFinite(durationMs) && durationMs > 0
      ? Math.max(1, Math.round(durationMs / (1000 * 60)))
      : null;
  const canDeleteClassForActor =
    session.kind === "CLASS" &&
    (session.createdBy === actor.id || Boolean(actorParticipant));
  const canDeletePersonalForActor =
    session.kind === "PERSONAL" && session.createdBy === actor.id;
  return {
    draftId: draft.id,
    sessionId: draft.sessionId,
    redirectSessionId: draft.redirectSessionId ?? null,
    title: draft.title,
    kind: session.kind,
    statusForCard: draft.statusForCard,
    updatedAt: draft.updatedAt,
    createdAt: draft.createdAt,
    startedAt,
    endedAt,
    durationMinutes,
    canEdit: session.status !== "ended" && permissions.canDraw,
    canInvite: permissions.canInvite,
    canDelete: canDeleteClassForActor || canDeletePersonalForActor,
    participantsCount: participants.length,
    isOwner: session.createdBy === actor.id,
    participants:
      session.kind === "CLASS"
        ? participants
            .map((participant) => serializeWorkbookParticipant(db, participant))
            .map((participant) => ({
              userId: participant.userId,
              displayName: participant.displayName,
              photo: participant.photo,
              roleInSession: participant.roleInSession,
            }))
        : [],
  };
};

const canActorAccessWorkbookSession = (
  db: ReturnType<typeof getDb>,
  sessionId: string,
  actorUserId: string
) => Boolean(getWorkbookParticipant(db, sessionId, actorUserId));

const isWorkbookInviteExpired = (invite: WorkbookInviteRecord, nowMs = nowTs()) => {
  if (!invite.expiresAt) return false;
  const expiresAtMs = Date.parse(invite.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return false;
  return nowMs > expiresAtMs;
};


const getPrimaryTeacherUser = (db: ReturnType<typeof getDb>) =>
  db.users.find(
    (user) =>
      user.role === "teacher" && normalizeEmail(user.email) === primaryTeacherEmail
  ) ??
  db.users.find((user) => user.role === "teacher") ??
  null;

const resolveGuidedPrice = (
  db: ReturnType<typeof getDb>,
  purchase: { courseId: string; price: number; courseSnapshot?: { priceGuided: number } }
) => {
  if (
    purchase.courseSnapshot &&
    typeof purchase.courseSnapshot.priceGuided === "number" &&
    Number.isFinite(purchase.courseSnapshot.priceGuided)
  ) {
    return purchase.courseSnapshot.priceGuided;
  }
  const course = db.courses.find((item) => item.id === purchase.courseId);
  if (!course || !Number.isFinite(course.priceGuided)) return null;
  return course.priceGuided;
};

const hasPremiumTeacherChatAccess = (
  db: ReturnType<typeof getDb>,
  studentId: string
) =>
  db.purchases.some((purchase) => {
    if (purchase.userId !== studentId) return false;
    const guidedPrice = resolveGuidedPrice(db, purchase);
    if (guidedPrice === null) return false;
    return Math.abs((purchase.price ?? 0) - guidedPrice) < 0.01;
  });

const hasBookingTeacherChatAccess = (
  db: ReturnType<typeof getDb>,
  studentId: string
) => db.bookings.some((booking) => booking.studentId === studentId);

const resolveTeacherChatEligibility = (
  db: ReturnType<typeof getDb>,
  actor: { id: string; role: "student" | "teacher" }
): TeacherChatEligibilityResult => {
  const teacher = getPrimaryTeacherUser(db);
  if (!teacher) {
    return {
      available: false,
      reason: "teacher_not_found",
      hasPremiumAccess: false,
      hasBookingAccess: false,
      teacher: null,
    };
  }
  if (actor.role === "teacher") {
    return {
      available: true,
      reason: "teacher",
      hasPremiumAccess: true,
      hasBookingAccess: true,
      teacher,
    };
  }

  const hasPremiumAccess = hasPremiumTeacherChatAccess(db, actor.id);
  const hasBookingAccess = hasBookingTeacherChatAccess(db, actor.id);
  const available = hasPremiumAccess || hasBookingAccess;

  return {
    available,
    reason: available ? "eligible" : "premium_or_booking_required",
    hasPremiumAccess,
    hasBookingAccess,
    teacher,
  };
};

const ensureTeacherChatThread = (
  db: ReturnType<typeof getDb>,
  params: { studentId: string; teacherId: string; timestamp?: string }
) => {
  const timestamp = params.timestamp ?? nowIso();
  const existing =
    db.chatThreads.find(
      (thread) =>
        thread.studentId === params.studentId && thread.teacherId === params.teacherId
    ) ?? null;
  if (existing) return existing;
  const created: ChatThreadRecord = {
    id: ensureId(),
    teacherId: params.teacherId,
    studentId: params.studentId,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageId: null,
    studentLastReadAt: timestamp,
    teacherLastReadAt: timestamp,
  };
  db.chatThreads.push(created);
  return created;
};

const sortMessagesAsc = (messages: ChatMessageRecord[]) =>
  [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const normalizeStoredChatMessage = (message: ChatMessageRecord): ChatMessageRecord => ({
  ...message,
  editedAt: message.editedAt ?? null,
  attachments: Array.isArray(message.attachments) ? message.attachments : [],
  deletedForAll: Boolean(message.deletedForAll),
  deletedForUserIds: Array.isArray(message.deletedForUserIds)
    ? [...new Set(message.deletedForUserIds.filter((item) => typeof item === "string"))]
    : [],
});

const getChatThreadMessages = (db: ReturnType<typeof getDb>, threadId: string) =>
  sortMessagesAsc(
    db.chatMessages
      .filter((message) => message.threadId === threadId)
      .map(normalizeStoredChatMessage)
  );

const getChatThreadMessagesForActor = (
  db: ReturnType<typeof getDb>,
  threadId: string,
  actorId: string
) =>
  getChatThreadMessages(db, threadId).filter(
    (message) => !message.deletedForUserIds?.includes(actorId)
  );

const updateThreadReadMark = (
  thread: ChatThreadRecord,
  role: "student" | "teacher",
  timestamp: string
) => {
  if (role === "student") {
    thread.studentLastReadAt = timestamp;
  } else {
    thread.teacherLastReadAt = timestamp;
  }
};

const calculateUnreadForViewer = (
  thread: ChatThreadRecord,
  messages: ChatMessageRecord[],
  viewer: { role: "student" | "teacher"; id: string }
) => {
  const fromRole = viewer.role === "student" ? "teacher" : "student";
  const readAt =
    viewer.role === "student" ? thread.studentLastReadAt : thread.teacherLastReadAt;
  const visibleMessages = messages.filter(
    (message) => !message.deletedForUserIds?.includes(viewer.id)
  );
  if (!readAt) {
    return visibleMessages.filter((message) => message.senderRole === fromRole).length;
  }
  return visibleMessages.filter(
    (message) => message.senderRole === fromRole && message.createdAt > readAt
  ).length;
};

const canActorAccessChatThread = (
  thread: ChatThreadRecord,
  actor: { id: string; role: "student" | "teacher" }
) => {
  if (actor.role === "teacher") return thread.teacherId === actor.id;
  return thread.studentId === actor.id;
};

const toDisplayName = (user?: { firstName?: string; lastName?: string; email?: string }) => {
  if (!user) return "Пользователь";
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return fullName || user.email || "Пользователь";
};

const normalizeWorkbookGuestName = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 72) : "";

const splitWorkbookGuestName = (displayName: string) => {
  const normalized = normalizeWorkbookGuestName(displayName);
  if (!normalized) {
    return {
      firstName: "Гость",
      lastName: "",
    };
  }
  const [firstName, ...tail] = normalized.split(" ");
  return {
    firstName: firstName || "Гость",
    lastName: tail.join(" "),
  };
};

const createWorkbookGuestUser = (
  db: ReturnType<typeof getDb>,
  displayName: string
) => {
  const parsedName = splitWorkbookGuestName(displayName);
  const userId = ensureId();
  const user: (typeof db.users)[number] = {
    id: userId,
    email: `guest-${userId}@axiom.local`,
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    role: "student",
    phone: "",
    photo: "",
    password: "",
  };
  db.users.push(user);
  return user;
};

const resolveChatSenderName = (
  db: ReturnType<typeof getDb>,
  message: ChatMessageRecord
) => {
  const user = db.users.find((candidate) => candidate.id === message.senderId);
  if (user) return toDisplayName(user);
  return message.senderRole === "teacher" ? "Преподаватель" : "Студент";
};

const resolveChatSenderPhoto = (
  db: ReturnType<typeof getDb>,
  message: ChatMessageRecord
) => {
  const user = db.users.find((candidate) => candidate.id === message.senderId);
  return user?.photo;
};

const sanitizeAttachmentInput = (
  raw: unknown
): SerializableChatAttachment | null => {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as {
    id?: unknown;
    name?: unknown;
    mimeType?: unknown;
    size?: unknown;
    url?: unknown;
  };
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const mimeType = typeof item.mimeType === "string" ? item.mimeType.trim() : "";
  const url = typeof item.url === "string" ? item.url.trim() : "";
  const size =
    typeof item.size === "number" && Number.isFinite(item.size) ? item.size : 0;
  if (!id || !name || !mimeType || !url) return null;
  if (size <= 0 || size > CHAT_MAX_ATTACHMENT_SIZE_BYTES) return null;
  return {
    id,
    name: name.slice(0, 220),
    mimeType: mimeType.slice(0, 120),
    size,
    url,
  };
};

const sanitizeAttachmentsInput = (raw: unknown): SerializableChatAttachment[] => {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((item) => sanitizeAttachmentInput(item))
    .filter((item): item is SerializableChatAttachment => Boolean(item));
  if (normalized.length <= CHAT_MAX_ATTACHMENTS_PER_MESSAGE) {
    return normalized;
  }
  return normalized.slice(0, CHAT_MAX_ATTACHMENTS_PER_MESSAGE);
};

const serializeChatMessage = (
  db: ReturnType<typeof getDb>,
  message: ChatMessageRecord,
  options?: { readByPeer?: boolean }
) => {
  const normalized = normalizeStoredChatMessage(message);
  return {
    id: normalized.id,
    threadId: normalized.threadId,
    senderId: normalized.senderId,
    senderRole: normalized.senderRole,
    senderName: resolveChatSenderName(db, normalized),
    senderPhoto: resolveChatSenderPhoto(db, normalized),
    text: normalized.deletedForAll ? "Сообщение удалено" : normalized.text,
    createdAt: normalized.createdAt,
    editedAt: normalized.editedAt ?? undefined,
    attachments: normalized.deletedForAll ? [] : normalized.attachments ?? [],
    deletedForAll: normalized.deletedForAll,
    readByPeer: options?.readByPeer,
  };
};

const parseCookies = (req: import("http").IncomingMessage) => {
  const header = req.headers.cookie;
  if (!header) return {} as Record<string, string>;
  return header.split(";").reduce<Record<string, string>>((acc, chunk) => {
    const [rawKey, ...rawValue] = chunk.split("=");
    const key = rawKey?.trim();
    if (!key) return acc;
    const value = rawValue.join("=").trim();
    try {
      acc[key] = decodeURIComponent(value);
    } catch {
      acc[key] = value;
    }
    return acc;
  }, {});
};

const setSessionCookie = (
  res: import("http").ServerResponse,
  sessionId: string
) => {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_SESSION_COOKIE}=${encodeURIComponent(
      sessionId
    )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
      AUTH_SESSION_TTL_MS / 1000
    )}`
  );
};

const clearSessionCookie = (res: import("http").ServerResponse) => {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
};

const normalizeIdempotencyMethod = (method: string) =>
  method === "POST" || method === "PUT" ? method : null;

const normalizeIdempotencyKey = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 180) : "";

const getIdempotencyKeyFromRequest = (req: import("http").IncomingMessage) =>
  normalizeIdempotencyKey(req.headers[IDEMPOTENCY_HEADER_NAME]);

const normalizeForIdempotencyHash = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeForIdempotencyHash);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return entries.reduce<Record<string, unknown>>((acc, [key, entryValue]) => {
      acc[key] = normalizeForIdempotencyHash(entryValue);
      return acc;
    }, {});
  }
  return value;
};

const hashIdempotencyBody = (value: unknown) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizeForIdempotencyHash(value ?? null)))
    .digest("hex");

type IdempotencyResolution =
  | { mode: "none" }
  | { mode: "replay"; statusCode: number; response: unknown }
  | { mode: "conflict" }
  | {
      mode: "new";
      record: {
        key: string;
        method: "POST" | "PUT";
        path: string;
        bodyHash: string;
      };
    };

const resolveIdempotencyRequest = (
  db: ReturnType<typeof getDb>,
  req: import("http").IncomingMessage,
  path: string,
  methodRaw: string,
  body: unknown
): IdempotencyResolution => {
  const method = normalizeIdempotencyMethod(methodRaw);
  if (!method) return { mode: "none" };
  const key = getIdempotencyKeyFromRequest(req);
  if (!key) return { mode: "none" };

  const bodyHash = hashIdempotencyBody(body);
  const existing = db.idempotency.find((record) => record.key === key) ?? null;
  if (!existing) {
    return {
      mode: "new",
      record: {
        key,
        method,
        path,
        bodyHash,
      },
    };
  }

  const signatureMatches =
    existing.method === method &&
    existing.path === path &&
    existing.bodyHash === bodyHash;
  if (!signatureMatches) {
    return { mode: "conflict" };
  }

  try {
    const parsed = existing.responseBody ? JSON.parse(existing.responseBody) : null;
    return {
      mode: "replay",
      statusCode: existing.statusCode,
      response: parsed,
    };
  } catch {
    return {
      mode: "replay",
      statusCode: existing.statusCode,
      response: null,
    };
  }
};

const registerIdempotencyResponse = (
  db: ReturnType<typeof getDb>,
  request:
    | {
        key: string;
        method: "POST" | "PUT";
        path: string;
        bodyHash: string;
      }
    | null,
  statusCode: number,
  response: unknown,
  timestamp = nowIso()
) => {
  if (!request) return;
  const existing = db.idempotency.find((record) => record.key === request.key);
  const responseBody = JSON.stringify(response ?? null);
  if (existing) {
    existing.method = request.method;
    existing.path = request.path;
    existing.bodyHash = request.bodyHash;
    existing.statusCode = statusCode;
    existing.responseBody = responseBody;
    existing.createdAt = timestamp;
    existing.expiresAt = toIsoFromNow(IDEMPOTENCY_RECORD_TTL_MS);
    return;
  }
  const record: IdempotencyRecord = {
    id: ensureId(),
    key: request.key,
    method: request.method,
    path: request.path,
    bodyHash: request.bodyHash,
    statusCode,
    responseBody,
    createdAt: timestamp,
    expiresAt: toIsoFromNow(IDEMPOTENCY_RECORD_TTL_MS),
  };
  db.idempotency.push(record);
};

const pruneIdempotencyRecords = (db: ReturnType<typeof getDb>, now = nowTs()) => {
  const before = db.idempotency.length;
  db.idempotency = db.idempotency.filter((record) => {
    const expiresAt = new Date(record.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
  return before !== db.idempotency.length;
};

const pruneAuthSessions = (db: ReturnType<typeof getDb>, now = nowTs()) => {
  const before = db.authSessions.length;
  db.authSessions = db.authSessions.filter((session) => {
    if (session.state !== "active") return false;
    const expiresAt = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
    const lastActivityAt = session.lastActivityAt ?? session.updatedAt ?? session.createdAt;
    const lastActivityTs = new Date(lastActivityAt).getTime();
    return (
      Number.isFinite(lastActivityTs) &&
      now - lastActivityTs <= AUTH_SESSION_IDLE_TTL_MS
    );
  });
  if (db.authSessions.length !== before) {
    saveDb();
  }
};

const createAuthSession = (
  db: ReturnType<typeof getDb>,
  params: {
    userId: string;
    email: string;
    role: "student" | "teacher";
  },
  timestamp = nowIso()
) => {
  const session: AuthSessionRecord = {
    id: ensureId(),
    userId: params.userId,
    email: normalizeEmail(params.email),
    role: params.role,
    state: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: new Date(Date.now() + AUTH_SESSION_TTL_MS).toISOString(),
    lastActivityAt: timestamp,
  };
  db.authSessions = db.authSessions.filter(
    (record) =>
      !(
        record.userId === params.userId &&
        record.role === params.role &&
        record.state === "active"
      )
  );
  db.authSessions.push(session);
  return session;
};

const resolveSessionActor = (
  db: ReturnType<typeof getDb>,
  req: import("http").IncomingMessage
) => {
  const cookies = parseCookies(req);
  const sessionId = cookies[AUTH_SESSION_COOKIE];
  if (!sessionId) return null;
  const session = db.authSessions.find((record) => record.id === sessionId);
  if (!session || session.state !== "active") return null;
  const expiresAt = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= nowTs()) {
    session.state = "expired";
    session.updatedAt = nowIso();
    saveDb();
    return null;
  }
  const lastActivityAt = session.lastActivityAt ?? session.updatedAt ?? session.createdAt;
  const lastActivityTs = new Date(lastActivityAt).getTime();
  if (
    !Number.isFinite(lastActivityTs) ||
    nowTs() - lastActivityTs > AUTH_SESSION_IDLE_TTL_MS
  ) {
    session.state = "expired";
    session.updatedAt = nowIso();
    session.lastActivityAt = nowIso();
    saveDb();
    return null;
  }
  const user = db.users.find((candidate) => candidate.id === session.userId) ?? null;
  if (!user) {
    session.state = "revoked";
    session.updatedAt = nowIso();
    saveDb();
    return null;
  }
  session.lastActivityAt = nowIso();
  return { session, user };
};

const revokeAuthSession = (
  db: ReturnType<typeof getDb>,
  sessionId: string,
  timestamp = nowIso()
) => {
  const session = db.authSessions.find((record) => record.id === sessionId);
  if (!session || session.state !== "active") return false;
  session.state = "revoked";
  session.updatedAt = timestamp;
  return true;
};

const ensureDomainCollections = (db: ReturnType<typeof getDb>) => {
  let mutated = false;
  if (!Array.isArray(db.checkoutProcesses)) {
    db.checkoutProcesses = [];
    mutated = true;
  }
  if (!Array.isArray(db.entitlements)) {
    db.entitlements = [];
    mutated = true;
  }
  if (!Array.isArray(db.identity)) {
    db.identity = [];
    mutated = true;
  }
  if (!Array.isArray(db.consents)) {
    db.consents = [];
    mutated = true;
  }
  if (!Array.isArray(db.bookingLifecycle)) {
    db.bookingLifecycle = [];
    mutated = true;
  }
  if (!Array.isArray(db.paymentEvents)) {
    db.paymentEvents = [];
    mutated = true;
  }
  if (!Array.isArray(db.outbox)) {
    db.outbox = [];
    mutated = true;
  }
  if (!Array.isArray(db.supportActions)) {
    db.supportActions = [];
    mutated = true;
  }
  if (!Array.isArray(db.authSessions)) {
    db.authSessions = [];
    mutated = true;
  }
  if (!Array.isArray(db.authCredentials)) {
    db.authCredentials = [];
    mutated = true;
  }
  if (!Array.isArray(db.authOneTimeCodes)) {
    db.authOneTimeCodes = [];
    mutated = true;
  }
  if (!Array.isArray(db.passwordResetTokens)) {
    db.passwordResetTokens = [];
    mutated = true;
  }
  if (!Array.isArray(db.authAudit)) {
    db.authAudit = [];
    mutated = true;
  }
  if (!Array.isArray(db.idempotency)) {
    db.idempotency = [];
    mutated = true;
  }
  if (!Array.isArray(db.rumTelemetry)) {
    db.rumTelemetry = [];
    mutated = true;
  }
  if (!Array.isArray(db.chatThreads)) {
    db.chatThreads = [];
    mutated = true;
  }
  if (!Array.isArray(db.chatMessages)) {
    db.chatMessages = [];
    mutated = true;
  }
  if (!Array.isArray(db.workbookSessions)) {
    db.workbookSessions = [];
    mutated = true;
  }
  if (!Array.isArray(db.workbookParticipants)) {
    db.workbookParticipants = [];
    mutated = true;
  }
  if (!Array.isArray(db.workbookDrafts)) {
    db.workbookDrafts = [];
    mutated = true;
  }
  if (!Array.isArray(db.workbookInvites)) {
    db.workbookInvites = [];
    mutated = true;
  }
  if (!Array.isArray(db.workbookEvents)) {
    db.workbookEvents = [];
    mutated = true;
  }
  if (!Array.isArray(db.workbookSnapshots)) {
    db.workbookSnapshots = [];
    mutated = true;
  }
  if (!Array.isArray(db.assistantSessions)) {
    db.assistantSessions = [];
    mutated = true;
  }
  if (!Array.isArray(db.assistantMessages)) {
    db.assistantMessages = [];
    mutated = true;
  }
  if (!Array.isArray(db.assistantEvents)) {
    db.assistantEvents = [];
    mutated = true;
  }
  if (mutated) saveDb();
};

const getAuthCredential = (db: ReturnType<typeof getDb>, userId: string) =>
  db.authCredentials.find((record) => record.userId === userId) ?? null;

const ensureAuthCredential = (
  db: ReturnType<typeof getDb>,
  userId: string,
  timestamp = nowIso()
) => {
  const existing = getAuthCredential(db, userId);
  if (existing) return existing;
  const created: AuthCredentialRecord = {
    userId,
    algo: "scrypt-v1",
    state: "none",
    failedAttempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.authCredentials.push(created);
  return created;
};

const registerAuthAudit = (
  db: ReturnType<typeof getDb>,
  params: {
    action: AuthAuditAction;
    email: string;
    userId?: string;
    metadata?: unknown;
  },
  createdAt = nowIso()
) => {
  const email = normalizeEmail(params.email);
  if (!email) return;
  db.authAudit.push({
    id: ensureId(),
    action: params.action,
    userId: params.userId,
    email,
    metadata: serializeAuditMetadata(params.metadata),
    createdAt,
  });
};

const isAuthCredentialLocked = (
  credential: AuthCredentialRecord,
  timestampMs = nowTs()
) => {
  if (!credential.lockedUntil) return false;
  const lockedUntil = new Date(credential.lockedUntil).getTime();
  return Number.isFinite(lockedUntil) && lockedUntil > timestampMs;
};

const clearAuthCredentialLock = (
  credential: AuthCredentialRecord,
  timestamp = nowIso()
) => {
  credential.failedAttempts = 0;
  credential.lockedUntil = undefined;
  credential.state = credential.passwordHash ? "active" : "none";
  credential.updatedAt = timestamp;
};

const markAuthCredentialFailedAttempt = (
  credential: AuthCredentialRecord,
  timestamp = nowIso()
) => {
  credential.failedAttempts += 1;
  if (credential.failedAttempts >= AUTH_PASSWORD_MAX_FAILED_ATTEMPTS) {
    credential.state = "locked_temp";
    credential.lockedUntil = toIsoFromNow(AUTH_PASSWORD_LOCK_MS);
    credential.failedAttempts = 0;
  }
  credential.updatedAt = timestamp;
};

const setAuthCredentialPassword = (
  credential: AuthCredentialRecord,
  nextPassword: string,
  timestamp = nowIso()
) => {
  credential.passwordHash = hashPassword(nextPassword);
  credential.algo = "scrypt-v1";
  credential.state = "active";
  credential.failedAttempts = 0;
  credential.lockedUntil = undefined;
  credential.updatedAt = timestamp;
  credential.lastPasswordChangeAt = timestamp;
};

const issuePasswordResetToken = (
  db: ReturnType<typeof getDb>,
  params: { userId: string; email: string },
  createdAt = nowIso()
) => {
  const email = normalizeEmail(params.email);
  if (!email) return null;
  const rawToken = crypto.randomBytes(24).toString("base64url");
  const tokenHash = hashPasswordResetToken(rawToken);
  const token: PasswordResetTokenRecord = {
    id: ensureId(),
    userId: params.userId,
    email,
    tokenHash,
    state: "issued",
    expiresAt: toIsoFromNow(AUTH_PASSWORD_RESET_TTL_MS),
    createdAt,
    updatedAt: createdAt,
  };
  db.passwordResetTokens.push(token);
  return { token, rawToken };
};

const consumePasswordResetToken = (
  db: ReturnType<typeof getDb>,
  params: {
    email: string;
    token: string;
  },
  timestamp = nowIso()
) => {
  const email = normalizeEmail(params.email);
  const tokenHash = hashPasswordResetToken(params.token);
  const nowMs = new Date(timestamp).getTime();
  const resetToken = db.passwordResetTokens.find((record) => {
    if (record.state !== "issued") return false;
    if (normalizeEmail(record.email) !== email) return false;
    if (record.tokenHash !== tokenHash) return false;
    const expiresAt = new Date(record.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt > nowMs;
  });
  if (!resetToken) return null;
  resetToken.state = "consumed";
  resetToken.consumedAt = timestamp;
  resetToken.updatedAt = timestamp;
  return resetToken;
};

const prunePasswordResetTokens = (
  db: ReturnType<typeof getDb>,
  timestamp = nowIso()
) => {
  const nowMs = new Date(timestamp).getTime();
  let mutated = false;
  db.passwordResetTokens.forEach((record) => {
    if (record.state !== "issued") return;
    const expiresAt = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt > nowMs) return;
    record.state = "expired";
    record.updatedAt = timestamp;
    mutated = true;
  });
  return mutated;
};

const issueAuthOneTimeCode = (
  db: ReturnType<typeof getDb>,
  params: {
    email: string;
    userId?: string;
  },
  createdAt = nowIso()
) => {
  const email = normalizeEmail(params.email);
  if (!email) return null;

  db.authOneTimeCodes.forEach((record) => {
    if (record.state !== "issued") return;
    if (normalizeEmail(record.email) !== email) return;
    if (record.purpose !== "login") return;
    record.state = "expired";
    record.updatedAt = createdAt;
  });

  const rawCode = generateOneTimeCode();
  const codeHash = hashAuthCode(rawCode);
  const code: AuthOneTimeCodeRecord = {
    id: ensureId(),
    email,
    userId: params.userId,
    purpose: "login",
    codeHash,
    state: "issued",
    expiresAt: toIsoFromNow(AUTH_MAGIC_CODE_TTL_MS),
    maxAttempts: AUTH_MAGIC_CODE_MAX_ATTEMPTS,
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
  };
  db.authOneTimeCodes.push(code);
  return {
    code,
    rawCode,
  };
};

const confirmAuthOneTimeCode = (
  db: ReturnType<typeof getDb>,
  params: {
    email: string;
    rawCode: string;
  },
  timestamp = nowIso()
): {
  ok: true;
  record: AuthOneTimeCodeRecord;
} | {
  ok: false;
  reason: "not_found" | "expired" | "invalid" | "too_many_attempts";
} => {
  const email = normalizeEmail(params.email);
  const codeHash = hashAuthCode(params.rawCode);
  const now = new Date(timestamp).getTime();
  const candidate = db.authOneTimeCodes
    .filter(
      (record) =>
        record.purpose === "login" &&
        record.state === "issued" &&
        normalizeEmail(record.email) === email
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (!candidate) {
    return { ok: false, reason: "not_found" };
  }

  const expiresAt = new Date(candidate.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    candidate.state = "expired";
    candidate.updatedAt = timestamp;
    return { ok: false, reason: "expired" };
  }

  if (candidate.codeHash !== codeHash) {
    candidate.attemptCount += 1;
    if (candidate.attemptCount >= candidate.maxAttempts) {
      candidate.state = "expired";
      candidate.updatedAt = timestamp;
      return { ok: false, reason: "too_many_attempts" };
    }
    candidate.updatedAt = timestamp;
    return { ok: false, reason: "invalid" };
  }

  candidate.state = "consumed";
  candidate.consumedAt = timestamp;
  candidate.updatedAt = timestamp;
  return { ok: true, record: candidate };
};

const pruneAuthOneTimeCodes = (
  db: ReturnType<typeof getDb>,
  timestamp = nowIso()
) => {
  const now = new Date(timestamp).getTime();
  let mutated = false;
  db.authOneTimeCodes.forEach((record) => {
    if (record.state !== "issued") return;
    const expiresAt = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt > now) return;
    record.state = "expired";
    record.updatedAt = timestamp;
    mutated = true;
  });
  return mutated;
};

const setCheckoutState = (
  checkout: CheckoutProcess,
  nextState: CheckoutState,
  updatedAt = nowIso()
) => {
  if (checkout.state === nextState) return;
  assertCheckoutTransition(checkout.state, nextState);
  checkout.state = nextState;
  checkout.updatedAt = updatedAt;
};

const upsertIdentityRecord = (
  db: ReturnType<typeof getDb>,
  nextRecord: Pick<IdentityRecord, "email" | "userId" | "state">,
  updatedAt = nowIso()
) => {
  const email = normalizeEmail(nextRecord.email);
  if (!email) return;
  const index = db.identity.findIndex((record) => normalizeEmail(record.email) === email);
  if (index === -1) {
    db.identity.push({
      email,
      userId: nextRecord.userId,
      state: nextRecord.state,
      createdAt: updatedAt,
      updatedAt,
    });
    return;
  }
  const current = db.identity[index];
  const mergedState: IdentityState =
    current.state === "verified" && nextRecord.state === "known_unverified"
      ? "verified"
      : nextRecord.state;
  if (current.state !== mergedState) {
    try {
      assertIdentityTransition(current.state, mergedState);
      current.state = mergedState;
      current.updatedAt = updatedAt;
    } catch {
      // Keep current state if a backward/invalid transition is attempted.
    }
  }
  if (nextRecord.userId && current.userId !== nextRecord.userId) {
    current.userId = nextRecord.userId;
    current.updatedAt = updatedAt;
  }
};

const getIdentityRecord = (
  db: ReturnType<typeof getDb>,
  params: { email?: string; userId?: string }
) => {
  if (params.userId) {
    const byUserId = db.identity.find((record) => record.userId === params.userId);
    if (byUserId) return byUserId;
  }
  if (params.email) {
    return db.identity.find(
      (record) => normalizeEmail(record.email) === normalizeEmail(params.email)
    );
  }
  return undefined;
};

const isIdentityVerified = (
  db: ReturnType<typeof getDb>,
  params: { email?: string; userId?: string }
) => {
  const record = getIdentityRecord(db, params);
  return record?.state === "verified";
};

const getNextIdentityStateForUser = (
  db: ReturnType<typeof getDb>,
  params: { email: string; userId: string }
): IdentityState =>
  isIdentityVerified(db, params) ? "verified" : "known_unverified";

const activatePendingEntitlements = (
  db: ReturnType<typeof getDb>,
  userId: string,
  updatedAt = nowIso()
) => {
  db.entitlements.forEach((record) => {
    if (record.userId !== userId) return;
    if (record.state !== "pending_activation") return;
    assertEntitlementTransition(record.state, "active");
    record.state = "active";
    record.updatedAt = updatedAt;
  });
};

const upsertCourseEntitlement = (
  db: ReturnType<typeof getDb>,
  params: {
    userId: string;
    courseId: string;
    sourceId: string;
    activate: boolean;
  },
  updatedAt = nowIso()
) => {
  const existing = db.entitlements.find(
    (record) =>
      record.userId === params.userId &&
      record.kind === "course_access" &&
      record.courseId === params.courseId
  );
  if (!existing) {
    const fresh: EntitlementRecord = {
      id: ensureId(),
      userId: params.userId,
      kind: "course_access",
      state: "pending_activation",
      sourceType: "checkout",
      sourceId: params.sourceId,
      courseId: params.courseId,
      createdAt: updatedAt,
      updatedAt,
    };
    db.entitlements.push(fresh);
    if (params.activate) {
      assertEntitlementTransition(fresh.state, "active");
      fresh.state = "active";
      fresh.updatedAt = updatedAt;
    }
    return;
  }
  if (params.activate && existing.state !== "active") {
    assertEntitlementTransition(existing.state, "active");
    existing.state = "active";
  }
  existing.sourceId = params.sourceId;
  existing.updatedAt = updatedAt;
};

const upsertTrialEntitlement = (
  db: ReturnType<typeof getDb>,
  params: {
    userId: string;
    sourceId: string;
    activate: boolean;
  },
  updatedAt = nowIso()
) => {
  const existing = db.entitlements.find(
    (record) =>
      record.userId === params.userId &&
      record.kind === "trial_access_limited" &&
      record.sourceType === "booking"
  );
  if (!existing) {
    const fresh: EntitlementRecord = {
      id: ensureId(),
      userId: params.userId,
      kind: "trial_access_limited",
      state: "pending_activation",
      sourceType: "booking",
      sourceId: params.sourceId,
      createdAt: updatedAt,
      updatedAt,
    };
    db.entitlements.push(fresh);
    if (params.activate) {
      assertEntitlementTransition(fresh.state, "active");
      fresh.state = "active";
      fresh.updatedAt = updatedAt;
    }
    return;
  }
  if (params.activate && existing.state !== "active") {
    assertEntitlementTransition(existing.state, "active");
    existing.state = "active";
  }
  existing.sourceId = params.sourceId;
  existing.updatedAt = updatedAt;
};

const revokeBookingEntitlements = (
  db: ReturnType<typeof getDb>,
  bookingId: string,
  updatedAt = nowIso()
) => {
  db.entitlements.forEach((record) => {
    if (record.sourceType !== "booking" || record.sourceId !== bookingId) return;
    if (record.state === "revoked") return;
    assertEntitlementTransition(record.state, "revoked");
    record.state = "revoked";
    record.updatedAt = updatedAt;
  });
};

const upsertBookingLifecycle = (
  db: ReturnType<typeof getDb>,
  bookingId: string,
  nextState: TrialBookingState,
  updatedAt = nowIso()
) => {
  const existing = db.bookingLifecycle.find(
    (record) => record.bookingId === bookingId
  );
  if (!existing) {
    const fresh: BookingLifecycleRecord = {
      bookingId,
      state: "requested",
      updatedAt,
    };
    if (nextState !== "requested") {
      assertBookingTransition("requested", nextState);
      fresh.state = nextState;
    }
    db.bookingLifecycle.push(fresh);
    return;
  }
  if (existing.state === nextState) {
    existing.updatedAt = updatedAt;
    return;
  }
  try {
    assertBookingTransition(existing.state, nextState);
  } catch {
    return;
  }
  existing.state = nextState;
  existing.updatedAt = updatedAt;
};

const captureConsent = (
  db: ReturnType<typeof getDb>,
  params: {
    email: string;
    userId?: string;
    scope: ConsentScope;
    documentVersion?: string;
  },
  capturedAt = nowIso()
) => {
  const normalizedEmail = normalizeEmail(params.email);
  if (!normalizedEmail) return;
  const documentVersion = params.documentVersion ?? LEGAL_DOCUMENT_VERSION;
  const existing = db.consents.find(
    (record) =>
      normalizeEmail(record.email) === normalizedEmail &&
      record.scope === params.scope &&
      record.documentVersion === documentVersion
  );
  if (existing) {
    if (params.userId && existing.userId !== params.userId) {
      existing.userId = params.userId;
    }
    return;
  }
  const record: ConsentRecord = {
    id: ensureId(),
    userId: params.userId,
    email: normalizedEmail,
    scope: params.scope,
    documentVersion,
    capturedAt,
  };
  db.consents.push(record);
};

const isConsentScope = (value: unknown): value is ConsentScope =>
  value === "auth" ||
  value === "checkout" ||
  value === "trial_booking" ||
  value === "privacy" ||
  value === "terms";

const parseAcceptedConsentScopes = (value: unknown): ConsentScope[] => {
  if (!Array.isArray(value)) return [];
  const accepted = value.filter(isConsentScope);
  return Array.from(new Set(accepted));
};

const hasConsentRecord = (
  db: ReturnType<typeof getDb>,
  params: {
    email: string;
    userId?: string;
    scope: ConsentScope;
    documentVersion: string;
  }
) => {
  const email = normalizeEmail(params.email);
  return db.consents.some((record) => {
    if (record.scope !== params.scope) return false;
    if (record.documentVersion !== params.documentVersion) return false;
    if (params.userId && record.userId === params.userId) return true;
    return normalizeEmail(record.email) === email;
  });
};

const ensureVersionedConsents = (
  db: ReturnType<typeof getDb>,
  params: {
    email: string;
    userId?: string;
    requiredScopes: ConsentScope[];
    acceptedScopes?: unknown;
    capturedAt?: string;
  }
): {
  ok: true;
} | {
  ok: false;
  status: number;
  body: {
    error: string;
    code: "consent_required";
    requiredScopes: ConsentScope[];
    documentVersion: string;
  };
} => {
  const requiredScopes = Array.from(new Set(params.requiredScopes));
  const alreadyAccepted = requiredScopes.every((scope) =>
    hasConsentRecord(db, {
      email: params.email,
      userId: params.userId,
      scope,
      documentVersion: LEGAL_DOCUMENT_VERSION,
    })
  );
  if (alreadyAccepted) return { ok: true };

  const acceptedScopes = parseAcceptedConsentScopes(params.acceptedScopes);
  const acceptedSet = new Set(acceptedScopes);
  const hasRequiredInPayload = requiredScopes.every((scope) =>
    acceptedSet.has(scope)
  );
  if (!hasRequiredInPayload) {
    return {
      ok: false,
      status: 409,
      body: {
        error:
          "Для продолжения подтвердите согласие с условиями и обработкой персональных данных.",
        code: "consent_required",
        requiredScopes,
        documentVersion: LEGAL_DOCUMENT_VERSION,
      },
    };
  }

  const capturedAt = params.capturedAt ?? nowIso();
  requiredScopes.forEach((scope) => {
    captureConsent(
      db,
      {
        email: params.email,
        userId: params.userId,
        scope,
        documentVersion: LEGAL_DOCUMENT_VERSION,
      },
      capturedAt
    );
  });

  return { ok: true };
};

const serializeOutboxPayload = (payload: unknown) => {
  if (payload === undefined) return undefined;
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 8000 ? serialized.slice(0, 8000) : serialized;
  } catch {
    return undefined;
  }
};

const buildOutboxTemplate = (
  template: OutboxTemplate,
  params: {
    courseTitle?: string;
    checkoutId?: string;
    resetToken?: string;
    authCode?: string;
    recommendation?:
      | "complete_profile"
      | "verify_email"
      | "login"
      | "restore_access"
      | "no_access_records";
  }
) => {
  const courseTitle = params.courseTitle ?? "выбранный курс";
  if (template === "purchase_success") {
    return {
      subject: `Покупка оформлена: ${courseTitle}`,
      body: `Оплата подтверждена. Курс "${courseTitle}" закреплён за вашим аккаунтом. Если доступ не появился сразу, выполните повторный вход по email.`,
      payload: {
        recommendation: "login",
        checkoutId: params.checkoutId ?? null,
      },
    };
  }
  if (template === "verification_required") {
    return {
      subject: "Подтвердите email для доступа к курсу",
      body: `Оплата по курсу "${courseTitle}" зафиксирована, но доступ откроется после подтверждения email. После подтверждения вернитесь в профиль и нажмите вход по email.`,
      payload: {
        recommendation: "verify_email",
        checkoutId: params.checkoutId ?? null,
      },
    };
  }
  if (template === "verification_resend") {
    return {
      subject: "Повторная ссылка подтверждения email",
      body: "Вы запросили повторное письмо подтверждения. После подтверждения email доступ к ограниченным материалам активируется автоматически.",
      payload: {
        recommendation: "verify_email",
      },
    };
  }
  if (template === "password_reset") {
    return {
      subject: "Сброс пароля",
      body:
        "Вы запросили сброс пароля. Если это были не вы, просто проигнорируйте письмо. В тестовом режиме используйте код из payload для подтверждения сброса.",
      payload: {
        recommendation: "login",
        resetToken: params.resetToken ?? null,
      },
    };
  }
  if (template === "auth_code") {
    return {
      subject: "Код входа в Math Tutor",
      body:
        "Вы запросили код входа. Введите его в приложении, чтобы подтвердить email и войти в аккаунт. Если это были не вы, просто проигнорируйте письмо.",
      payload: {
        recommendation: "login",
        authCode: params.authCode ?? null,
      },
    };
  }
  return {
    subject: "Восстановление доступа к курсам",
    body:
      params.recommendation === "complete_profile"
        ? "Оплата подтверждена, но профиль заполнен не полностью. Войдите и завершите профиль для активации доступа."
        : params.recommendation === "verify_email"
        ? "Для восстановления доступа подтвердите email, затем повторно войдите в систему."
        : params.recommendation === "restore_access"
        ? "Оплата найдена. Выполните вход повторно: доступ будет восстановлен автоматически."
        : params.recommendation === "login"
        ? "Запись найдена. Выполните вход по email, чтобы продолжить обучение."
        : "По этому email записи об оплате пока не найдены. Если оплата была, обратитесь в поддержку.",
    payload: {
      recommendation: params.recommendation ?? "no_access_records",
    },
  };
};

const enqueueOutboxEmail = (
  db: ReturnType<typeof getDb>,
  params: {
    template: OutboxTemplate;
    dedupeKey: string;
    recipientEmail: string;
    userId?: string;
    checkoutId?: string;
    courseTitle?: string;
    resetToken?: string;
    authCode?: string;
    recommendation?:
      | "complete_profile"
      | "verify_email"
      | "login"
      | "restore_access"
      | "no_access_records";
  },
  createdAt = nowIso()
) => {
  const recipientEmail = normalizeEmail(params.recipientEmail);
  if (!recipientEmail) return null;

  const existing = db.outbox.find((record) => record.dedupeKey === params.dedupeKey);
  if (existing) {
    if (existing.status === "failed") {
      existing.status = "queued";
      existing.updatedAt = createdAt;
      existing.nextAttemptAt = undefined;
      existing.lastError = undefined;
    }
    return existing;
  }

  const template = buildOutboxTemplate(params.template, {
    courseTitle: params.courseTitle,
    checkoutId: params.checkoutId,
    resetToken: params.resetToken,
    authCode: params.authCode,
    recommendation: params.recommendation,
  });
  const record: OutboxRecord = {
    id: ensureId(),
    channel: "email",
    provider: EMAIL_RUNTIME.provider.name,
    template: params.template,
    dedupeKey: params.dedupeKey,
    recipientEmail,
    userId: params.userId,
    checkoutId: params.checkoutId,
    status: "queued",
    subject: template.subject,
    body: template.body,
    payload: serializeOutboxPayload(template.payload),
    attemptCount: 0,
    maxAttempts: Number.isFinite(OUTBOX_DEFAULT_MAX_ATTEMPTS)
      ? Math.max(1, Math.floor(OUTBOX_DEFAULT_MAX_ATTEMPTS))
      : 4,
    createdAt,
    updatedAt: createdAt,
  };
  db.outbox.push(record);
  return record;
};

const getOutboxRetryDelayMs = (attemptCount: number) => {
  if (attemptCount <= 1) return 60 * 1000;
  if (attemptCount === 2) return 5 * 60 * 1000;
  return 15 * 60 * 1000;
};

const dispatchOutboxQueue = async (
  db: ReturnType<typeof getDb>,
  dispatchedAt = nowIso()
) => {
  let delivered = 0;
  const dispatchedTs = new Date(dispatchedAt).getTime();

  for (const record of db.outbox) {
    if (record.status !== "queued") continue;
    if (record.nextAttemptAt) {
      const nextAttemptTs = new Date(record.nextAttemptAt).getTime();
      if (Number.isFinite(nextAttemptTs) && nextAttemptTs > dispatchedTs) {
        continue;
      }
    }

    const maxAttempts =
      Number.isFinite(record.maxAttempts) && Number(record.maxAttempts) > 0
        ? Number(record.maxAttempts)
        : 4;

    record.provider = EMAIL_RUNTIME.provider.name;
    record.attemptCount += 1;
    record.updatedAt = dispatchedAt;

    const result = await EMAIL_RUNTIME.provider.send({
      to: record.recipientEmail,
      subject: record.subject,
      text: record.body,
      template: record.template,
      metadata: {
        outboxId: record.id,
        dedupeKey: record.dedupeKey,
        userId: record.userId ?? null,
        checkoutId: record.checkoutId ?? null,
      },
    });

    if (result.ok) {
      record.status = "sent";
      record.sentAt = dispatchedAt;
      record.nextAttemptAt = undefined;
      record.lastError = undefined;
      record.providerMessageId = result.providerMessageId;
      delivered += 1;
      continue;
    }

    record.providerMessageId = undefined;
    record.lastError = `${result.errorCode}: ${result.errorMessage}`;
    const shouldRetry = result.retryable && record.attemptCount < maxAttempts;
    if (shouldRetry) {
      record.status = "queued";
      record.nextAttemptAt = toIsoFromNow(getOutboxRetryDelayMs(record.attemptCount), dispatchedTs);
    } else {
      record.status = "failed";
      record.nextAttemptAt = undefined;
    }
  }

  return delivered;
};

const normalizeCheckoutMethod = (value: unknown): CheckoutMethod => {
  if (value === "card" || value === "sbp" || value === "bnpl") {
    return value;
  }
  return "mock";
};

const isPurchasePaymentMethod = (
  value: unknown
): value is PurchasePaymentMethod =>
  value === "card" ||
  value === "sbp" ||
  value === "bnpl" ||
  value === "mock" ||
  value === "unknown";

const isBnplProvider = (value: unknown): value is BnplProvider =>
  value === "dolyami" ||
  value === "podeli" ||
  value === "unknown" ||
  value === "other";

const isBnplScheduleStatus = (value: unknown): value is BnplScheduleStatus =>
  value === "paid" || value === "due" || value === "overdue" || value === "failed";

const BNPL_INSTALLMENTS_COUNT = 4;
const BNPL_INSTALLMENT_INTERVAL_DAYS = 14;

const addDaysIso = (iso: string, days: number) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const toValidInstallmentsCount = (value: unknown) => {
  if (!Number.isFinite(value)) return undefined;
  const normalized = Math.floor(Number(value));
  if (normalized <= 0) return undefined;
  return normalized;
};

const buildBnplPurchaseSnapshot = (params: {
  amount: number;
  purchasedAt: string;
  selectedInstallmentsCount?: number;
}): BnplPurchaseData => {
  const safeAmount = Number.isFinite(params.amount) ? Math.max(0, params.amount) : 0;
  const selectedCount =
    toValidInstallmentsCount(params.selectedInstallmentsCount) ??
    BNPL_INSTALLMENTS_COUNT;
  const fallbackSchedule = Array.from({ length: selectedCount }, (_, index) => ({
    dueDate: addDaysIso(params.purchasedAt, BNPL_INSTALLMENT_INTERVAL_DAYS * index),
    amount: Math.ceil(safeAmount / selectedCount),
    status: (index === 0 ? "paid" : "due") as BnplScheduleStatus,
  }));

  const generated = buildBnplMockPurchaseData({
    price: safeAmount,
    purchasedAt: params.purchasedAt,
    provider: "dolyami",
    selectedInstallmentsCount: selectedCount,
    paidCount: 1,
  });
  const generatedPlan = generated.plan;
  return {
    ...generated,
    provider: "dolyami",
    plan: generatedPlan ?? {
      installmentsCount: selectedCount,
      paidCount: 1,
      nextPaymentDate: fallbackSchedule[1]?.dueDate,
      schedule: fallbackSchedule,
    },
    // legacy flattened compatibility fields
    installmentsCount: generatedPlan?.installmentsCount ?? selectedCount,
    paidCount: generatedPlan?.paidCount ?? 1,
    nextPaymentDate: generatedPlan?.nextPaymentDate ?? fallbackSchedule[1]?.dueDate,
    schedule: generatedPlan?.schedule ?? fallbackSchedule,
    lastKnownStatus: generated.lastKnownStatus ?? "active",
  };
};

const applyBnplInstallmentPayment = (
  purchase: Purchase,
  checkout: CheckoutProcess,
  processedAt: string
): {
  applied: boolean;
  installmentsCount: number;
  paidCount: number;
  nextPaymentDate?: string;
  completed: boolean;
} => {
  const normalizedBnpl = normalizeBnplData(
    purchase.bnpl,
    purchase.price ?? checkout.amount ?? 0,
    purchase.purchasedAt || checkout.createdAt,
    checkout.bnplInstallmentsCount
  );
  const fallback = buildBnplPurchaseSnapshot({
    amount: purchase.price ?? checkout.amount ?? 0,
    purchasedAt: purchase.purchasedAt || checkout.createdAt,
    selectedInstallmentsCount:
      normalizedBnpl.plan?.installmentsCount ?? checkout.bnplInstallmentsCount,
  });
  const fallbackPlan = fallback.plan ?? {
    installmentsCount: fallback.installmentsCount ?? 4,
    paidCount: fallback.paidCount ?? 1,
    nextPaymentDate: fallback.nextPaymentDate,
    schedule: fallback.schedule ?? [],
  };
  const basePlan = normalizedBnpl.plan ?? fallbackPlan;
  const schedule = [...(basePlan.schedule ?? fallbackPlan.schedule ?? [])].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate)
  );
  const installmentsCount = Math.max(
    1,
    Math.floor(basePlan.installmentsCount || schedule.length || 1)
  );
  const firstUnpaidIndex = schedule.findIndex((item) => item.status !== "paid");
  if (firstUnpaidIndex === -1) {
    const paidCount = Math.min(
      installmentsCount,
      Math.max(
        0,
        Math.floor(
          Number.isFinite(basePlan.paidCount) ? basePlan.paidCount : installmentsCount
        )
      )
    );
    purchase.paymentMethod = "bnpl";
    purchase.checkoutId = checkout.id;
    purchase.bnpl = {
      ...normalizedBnpl,
      plan: {
        installmentsCount,
        paidCount,
        nextPaymentDate: undefined,
        schedule,
      },
      installmentsCount,
      paidCount,
      nextPaymentDate: undefined,
      schedule,
      lastKnownStatus: "completed",
    };
    return {
      applied: false,
      installmentsCount,
      paidCount,
      nextPaymentDate: undefined,
      completed: true,
    };
  }

  schedule[firstUnpaidIndex] = {
    ...schedule[firstUnpaidIndex],
    status: "paid",
  };
  const paidCount = Math.min(
    installmentsCount,
    schedule.filter((item) => item.status === "paid").length
  );
  const nextPaymentDate = schedule.find((item) => item.status !== "paid")?.dueDate;
  const completed = paidCount >= installmentsCount || !nextPaymentDate;
  const hasOverdue = schedule.some(
    (item) => item.status === "overdue" || item.status === "failed"
  );
  const nextKnownStatus: NonNullable<BnplPurchaseData["lastKnownStatus"]> = completed
    ? "completed"
    : hasOverdue
      ? "overdue"
      : "active";

  purchase.paymentMethod = "bnpl";
  purchase.checkoutId = checkout.id;
  purchase.bnpl = {
    ...normalizedBnpl,
    plan: {
      installmentsCount,
      paidCount,
      nextPaymentDate,
      schedule,
    },
    installmentsCount,
    paidCount,
    nextPaymentDate,
    schedule,
    lastKnownStatus: nextKnownStatus,
  };

  const purchasedAtTime = new Date(purchase.purchasedAt).getTime();
  const processedTime = new Date(processedAt).getTime();
  if (Number.isFinite(purchasedAtTime) && Number.isFinite(processedTime)) {
    if (processedTime > purchasedAtTime) {
      purchase.purchasedAt = new Date(processedTime).toISOString();
    }
  }

  return {
    applied: true,
    installmentsCount,
    paidCount,
    nextPaymentDate,
    completed,
  };
};

const applyBnplRemainingPayment = (
  purchase: Purchase,
  checkout: CheckoutProcess,
  processedAt: string
): {
  applied: boolean;
  installmentsCount: number;
  paidCount: number;
  nextPaymentDate?: string;
  completed: boolean;
} => {
  const normalizedBnpl = normalizeBnplData(
    purchase.bnpl,
    purchase.price ?? checkout.amount ?? 0,
    purchase.purchasedAt || checkout.createdAt,
    checkout.bnplInstallmentsCount
  );
  const fallback = buildBnplPurchaseSnapshot({
    amount: purchase.price ?? checkout.amount ?? 0,
    purchasedAt: purchase.purchasedAt || checkout.createdAt,
    selectedInstallmentsCount:
      normalizedBnpl.plan?.installmentsCount ?? checkout.bnplInstallmentsCount,
  });
  const fallbackPlan = fallback.plan ?? {
    installmentsCount: fallback.installmentsCount ?? 4,
    paidCount: fallback.paidCount ?? 1,
    nextPaymentDate: fallback.nextPaymentDate,
    schedule: fallback.schedule ?? [],
  };
  const basePlan = normalizedBnpl.plan ?? fallbackPlan;
  const schedule = [...(basePlan.schedule ?? fallbackPlan.schedule ?? [])].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate)
  );
  const installmentsCount = Math.max(
    1,
    Math.floor(basePlan.installmentsCount || schedule.length || 1)
  );

  let changed = false;
  const normalizedSchedule = schedule.map((item) => {
    if (item.status === "paid") return item;
    changed = true;
    return { ...item, status: "paid" as const };
  });

  const paidCount = Math.min(
    installmentsCount,
    normalizedSchedule.filter((item) => item.status === "paid").length
  );
  const completed = paidCount >= installmentsCount;

  purchase.paymentMethod = "bnpl";
  purchase.checkoutId = checkout.id;
  purchase.bnpl = {
    ...normalizedBnpl,
    plan: {
      installmentsCount,
      paidCount,
      nextPaymentDate: undefined,
      schedule: normalizedSchedule,
    },
    installmentsCount,
    paidCount,
    nextPaymentDate: undefined,
    schedule: normalizedSchedule,
    lastKnownStatus: completed ? "completed" : "active",
  };

  const purchasedAtTime = new Date(purchase.purchasedAt).getTime();
  const processedTime = new Date(processedAt).getTime();
  if (Number.isFinite(purchasedAtTime) && Number.isFinite(processedTime)) {
    if (processedTime > purchasedAtTime) {
      purchase.purchasedAt = new Date(processedTime).toISOString();
    }
  }

  return {
    applied: changed,
    installmentsCount,
    paidCount,
    nextPaymentDate: undefined,
    completed,
  };
};

const isPaymentEventProvider = (value: unknown): value is PaymentEventProvider =>
  value === "mock" || value === "sbp" || value === "card" || value === "bnpl";

const isPaymentEventStatus = (value: unknown): value is PaymentEventStatus =>
  value === "awaiting_payment" ||
  value === "paid" ||
  value === "failed" ||
  value === "canceled" ||
  value === "expired";

const serializeEventPayload = (payload: unknown) => {
  if (payload === undefined) return undefined;
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 4000 ? serialized.slice(0, 4000) : serialized;
  } catch {
    return undefined;
  }
};

const getCardWebhookSignature = (
  rawBody: string,
  timestamp: string,
  secret = CARD_WEBHOOK_SECRET
) =>
  crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

const hasValidCardWebhookSignature = (
  rawBody: string,
  timestamp: string,
  signature: string
) => {
  if (!rawBody || !timestamp || !signature) return false;
  const expected = getCardWebhookSignature(rawBody, timestamp);
  const expectedBuffer = Buffer.from(expected, "utf-8");
  const actualBuffer = Buffer.from(signature, "utf-8");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

type CardWebhookStatus =
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "canceled"
  | "expired"
  | "refunded"
  | "chargeback";

const normalizeCardWebhookStatus = (value: unknown): CardWebhookStatus | null => {
  if (
    value === "awaiting_payment" ||
    value === "paid" ||
    value === "failed" ||
    value === "canceled" ||
    value === "expired" ||
    value === "refunded" ||
    value === "chargeback"
  ) {
    return value;
  }
  return null;
};

const mapCardWebhookToPaymentStatus = (
  status: CardWebhookStatus
): PaymentEventStatus => {
  if (status === "awaiting_payment") return "awaiting_payment";
  if (status === "paid") return "paid";
  if (status === "failed") return "failed";
  if (status === "canceled") return "canceled";
  if (status === "expired") return "expired";
  return "canceled";
};

const getProviderPaymentIdFromPayload = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") return undefined;
  const candidate = (payload as Record<string, unknown>).providerPaymentId;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : undefined;
};

const getCheckoutPaymentPayload = (
  paymentDecision: ReturnType<typeof initiateCheckoutPayment>
) => {
  const payload = paymentDecision.payload ?? {};
  const paymentUrl =
    typeof payload.paymentUrl === "string" ? payload.paymentUrl : undefined;
  const redirectUrl =
    typeof payload.redirectUrl === "string"
      ? payload.redirectUrl
      : paymentUrl;
  const returnUrl =
    typeof payload.returnUrl === "string" ? payload.returnUrl : undefined;
  const providerPaymentId = getProviderPaymentIdFromPayload(payload);
  const sbpQrUrl = typeof payload.qrUrl === "string" ? payload.qrUrl : undefined;
  const sbpDeepLinkUrl =
    typeof payload.deepLinkUrl === "string" ? payload.deepLinkUrl : undefined;
  const sbpExpiresAt =
    typeof payload.expiresAt === "string" ? payload.expiresAt : undefined;
  return {
    provider: paymentDecision.provider,
    status: paymentDecision.status,
    paymentUrl,
    redirectUrl,
    returnUrl,
    providerPaymentId,
    requiresConfirmation: paymentDecision.status === "awaiting_payment",
    sbp:
      paymentDecision.provider === "sbp"
        ? {
            qrUrl: sbpQrUrl,
            deepLinkUrl: sbpDeepLinkUrl,
            expiresAt: sbpExpiresAt,
          }
        : undefined,
  };
};

const parsePaymentEventPayload = (payload?: string) => {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
};

const getLatestCheckoutPaymentEvent = (
  db: ReturnType<typeof getDb>,
  checkoutId: string
) =>
  db.paymentEvents
    .filter((event) => event.checkoutId === checkoutId)
    .sort((a, b) => b.processedAt.localeCompare(a.processedAt))[0] ?? null;

const getCheckoutPaymentStatusPayload = (
  db: ReturnType<typeof getDb>,
  checkout: CheckoutProcess
) => {
  const latest = getLatestCheckoutPaymentEvent(db, checkout.id);
  const payload = parsePaymentEventPayload(latest?.payload);
  const paymentUrl =
    payload && typeof payload.paymentUrl === "string"
      ? payload.paymentUrl
      : undefined;
  const redirectUrl =
    payload && typeof payload.redirectUrl === "string"
      ? payload.redirectUrl
      : paymentUrl;
  const returnUrl =
    payload && typeof payload.returnUrl === "string"
      ? payload.returnUrl
      : undefined;
  const providerPaymentId = getProviderPaymentIdFromPayload(payload);
  const sbpQrUrl =
    payload && typeof payload.qrUrl === "string" ? payload.qrUrl : undefined;
  const sbpDeepLinkUrl =
    payload && typeof payload.deepLinkUrl === "string"
      ? payload.deepLinkUrl
      : undefined;
  const sbpExpiresAt =
    payload && typeof payload.expiresAt === "string"
      ? payload.expiresAt
      : undefined;
  const inferredStatus: PaymentEventStatus =
    checkout.state === "created"
      ? "awaiting_payment"
      : checkout.state === "awaiting_payment"
      ? "awaiting_payment"
      : checkout.state === "paid" ||
        checkout.state === "provisioning" ||
        checkout.state === "provisioned"
      ? "paid"
      : checkout.state === "failed"
      ? "failed"
      : checkout.state === "expired"
      ? "expired"
      : "canceled";
  return {
    provider: latest?.provider ?? resolveCheckoutProvider(db, checkout),
    status: latest?.status ?? inferredStatus,
    outcome: latest?.outcome ?? "applied",
    paymentUrl,
    redirectUrl,
    returnUrl,
    providerPaymentId,
    requiresConfirmation:
      (latest?.status ?? inferredStatus) === "awaiting_payment",
    lastProcessedAt: latest?.processedAt ?? null,
    sbp:
      checkout.method === "sbp"
        ? {
            qrUrl: sbpQrUrl,
            deepLinkUrl: sbpDeepLinkUrl,
            expiresAt: sbpExpiresAt,
          }
        : undefined,
  };
};

const pseudoRandomById = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
};

const maybeSettleAwaitingCheckout = (
  db: ReturnType<typeof getDb>,
  checkout: CheckoutProcess,
  processedAt = nowIso()
) => {
  if (
    checkout.state !== "created" &&
    checkout.state !== "awaiting_payment"
  ) {
    return;
  }
  const latest = getLatestCheckoutPaymentEvent(db, checkout.id);
  if (!latest || latest.status !== "awaiting_payment") return;
  const latestPayload = parsePaymentEventPayload(latest.payload);
  const startedAt = new Date(latest.processedAt).getTime();
  const nowTs = new Date(processedAt).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(nowTs)) return;

  if (checkout.method === "sbp") {
    const expiresAt =
      latestPayload && typeof latestPayload.expiresAt === "string"
        ? new Date(latestPayload.expiresAt).getTime()
        : Number.NaN;
    if (Number.isFinite(expiresAt) && nowTs > expiresAt) {
      processPaymentEvent(db, {
        provider: "sbp",
        externalEventId: `sbp:auto-expire:${checkout.id}:${Math.floor(nowTs / 1000)}`,
        checkoutId: checkout.id,
        status: "expired",
        payload: {
          source: "sbp_expired",
          expiresAt: latestPayload?.expiresAt ?? null,
        },
        processedAt,
      });
      return;
    }
  }

  const settleDelayMs = checkout.method === "card" ? 9000 : 7000;
  if (nowTs - startedAt < settleDelayMs) return;

  const randomScore = pseudoRandomById(checkout.id);
  const nextStatus: PaymentEventStatus =
    randomScore < 84 ? "paid" : checkout.method === "card" ? "failed" : "canceled";
  processPaymentEvent(db, {
    provider: checkout.method === "card" ? "card" : "sbp",
    externalEventId: `${checkout.method}:auto-settle:${checkout.id}:${Math.floor(
      nowTs / 1000
    )}`,
    checkoutId: checkout.id,
    status: nextStatus,
    payload: {
      source: "mock_async_settlement",
      score: randomScore,
    },
    processedAt,
  });
  ensureCheckoutProvisioned(db, checkout, processedAt);
};

const ensureCheckoutProvisioned = (
  db: ReturnType<typeof getDb>,
  checkout: CheckoutProcess,
  updatedAt = nowIso()
) => {
  if (!checkout.userId) return;
  if (checkout.state === "paid") {
    setCheckoutState(checkout, "provisioning", updatedAt);
  }
  if (checkout.state === "provisioning") {
    const canActivateEntitlement = isIdentityVerified(db, {
      userId: checkout.userId,
      email: checkout.email,
    });
    const alreadyPurchased = db.purchases.some(
      (purchase) =>
        purchase.userId === checkout.userId &&
        purchase.courseId === checkout.courseId
    );
    if (!alreadyPurchased) {
      const purchasedCourse =
        db.courses.find((course) => course.id === checkout.courseId) ?? null;
      const purchasedLessons = db.lessons
        .filter((lesson) => lesson.courseId === checkout.courseId)
        .sort((a, b) => a.order - b.order);
      const purchasedTestItemIds = getPurchasedTestItemIdsForCourse(
        db,
        checkout.courseId
      );
      db.purchases.push({
        id: ensureId(),
        userId: checkout.userId,
        courseId: checkout.courseId,
        price: checkout.amount,
        purchasedAt: updatedAt,
        paymentMethod: checkout.method,
        checkoutId: checkout.id,
        bnpl:
          checkout.method === "bnpl"
            ? buildBnplPurchaseSnapshot({
                amount: checkout.amount,
                purchasedAt: updatedAt,
                selectedInstallmentsCount: checkout.bnplInstallmentsCount,
              })
            : undefined,
        courseSnapshot: purchasedCourse
          ? JSON.parse(JSON.stringify(purchasedCourse))
          : undefined,
        lessonsSnapshot: JSON.parse(JSON.stringify(purchasedLessons)),
        purchasedTestItemIds,
      });
    }
    upsertCourseEntitlement(
      db,
      {
        userId: checkout.userId,
        courseId: checkout.courseId,
        sourceId: checkout.id,
        activate: canActivateEntitlement,
      },
      updatedAt
    );
    setCheckoutState(checkout, "provisioned", updatedAt);
  }
};

const getPurchasedTestItemIdsForCourse = (
  db: ReturnType<typeof getDb>,
  courseId: string
) => {
  const rawItems = db.assessments?.courseContent?.[courseId];
  if (!Array.isArray(rawItems)) return [] as string[];
  const seen = new Set<string>();
  rawItems.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const candidate = item as { type?: unknown; id?: unknown };
    if (candidate.type !== "test") return;
    if (typeof candidate.id !== "string" || !candidate.id.trim()) return;
    seen.add(candidate.id.trim());
  });
  return Array.from(seen);
};

const getCheckoutAccessPayload = (
  db: ReturnType<typeof getDb>,
  params: {
    userId: string;
    email: string;
    courseId: string;
  }
) => {
  const identity = getIdentityRecord(db, {
    userId: params.userId,
    email: params.email,
  });
  const identityState = identity?.state ?? "anonymous";
  const isVerifiedIdentity = identityState === "verified";
  const user = db.users.find((item) => item.id === params.userId) ?? null;
  const profileComplete = Boolean(
    user &&
      user.firstName?.trim() &&
      user.lastName?.trim() &&
      normalizePhoneStorage(user.phone)
  );
  const entitlement = db.entitlements
    .filter(
      (record) =>
        record.userId === params.userId &&
        record.kind === "course_access" &&
        record.courseId === params.courseId
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const entitlementState = entitlement?.state ?? "none";
  const accessState:
    | "active"
    | "awaiting_profile"
    | "awaiting_verification"
    | "paid_but_restricted" =
    !profileComplete
      ? "awaiting_profile"
      : !isVerifiedIdentity
      ? "awaiting_verification"
      : entitlementState !== "active"
      ? "paid_but_restricted"
      : "active";
  return {
    identityState,
    entitlementState,
    profileComplete,
    accessState,
  };
};

const isPositiveCheckoutState = (state: CheckoutState) =>
  state === "paid" || state === "provisioning" || state === "provisioned";

const getDedupeMinuteWindow = (timestamp: string) =>
  typeof timestamp === "string" && timestamp.length >= 16
    ? timestamp.slice(0, 16)
    : nowIso().slice(0, 16);

const queueCheckoutTransactionalEmail = (
  db: ReturnType<typeof getDb>,
  checkout: CheckoutProcess,
  timestamp = nowIso()
) => {
  if (!isPositiveCheckoutState(checkout.state)) return;
  const recipientEmail = normalizeEmail(checkout.email);
  if (!recipientEmail) return;
  const user = checkout.userId
    ? db.users.find((candidate) => candidate.id === checkout.userId) ?? null
    : null;
  const isVerified = checkout.userId
    ? isIdentityVerified(db, {
        userId: checkout.userId,
        email: recipientEmail,
      })
    : false;
  const template: OutboxTemplate = isVerified
    ? "purchase_success"
    : "verification_required";
  const courseTitle =
    db.courses.find((course) => course.id === checkout.courseId)?.title ?? "Курс";
  enqueueOutboxEmail(
    db,
    {
      template,
      dedupeKey: `checkout:${checkout.id}:${template}`,
      recipientEmail,
      userId: user?.id,
      checkoutId: checkout.id,
      courseTitle,
      recommendation: isVerified ? "login" : "verify_email",
    },
    timestamp
  );
};

const maybeAutoCaptureCardCheckout = (
  db: ReturnType<typeof getDb>,
  checkout: CheckoutProcess,
  paymentDecision: ReturnType<typeof initiateCheckoutPayment>,
  timestamp = nowIso()
) => {
  if (!CARD_AUTO_CAPTURE) return;
  if (paymentDecision.provider !== "card") return;
  if (paymentDecision.status !== "awaiting_payment") return;
  const providerPaymentId = getProviderPaymentIdFromPayload(paymentDecision.payload);
  const externalEventId = `card:auto-capture:${providerPaymentId ?? checkout.id}`;
  processPaymentEvent(db, {
    provider: "card",
    externalEventId,
    checkoutId: checkout.id,
    status: "paid",
    payload: {
      source: "card_auto_capture",
      providerPaymentId: providerPaymentId ?? null,
      autoCaptured: true,
    },
    processedAt: timestamp,
  });
};

const resolveCheckoutProvider = (
  db: ReturnType<typeof getDb>,
  checkout: CheckoutProcess
): PaymentEventProvider => {
  const latestEvent = db.paymentEvents
    .filter((event) => event.checkoutId === checkout.id)
    .sort((a, b) => b.processedAt.localeCompare(a.processedAt))[0];
  if (latestEvent) return latestEvent.provider;
  if (checkout.method === "card") return "card";
  if (checkout.method === "sbp") return "sbp";
  if (checkout.method === "bnpl") return "bnpl";
  return "mock";
};

const expireStaleCheckouts = (
  db: ReturnType<typeof getDb>,
  processedAt = nowIso()
) => {
  const currentTs = Date.now();
  let expired = 0;
  db.checkoutProcesses.forEach((checkout) => {
    if (
      checkout.state !== "created" &&
      checkout.state !== "awaiting_payment"
    ) {
      return;
    }
    const expiresAtTs = checkout.expiresAt
      ? new Date(checkout.expiresAt).getTime()
      : NaN;
    if (!Number.isFinite(expiresAtTs) || expiresAtTs > currentTs) {
      return;
    }
    const provider = resolveCheckoutProvider(db, checkout);
    const result = processPaymentEvent(db, {
      provider,
      externalEventId: `checkout:auto-expire:${checkout.id}:${checkout.expiresAt}`,
      checkoutId: checkout.id,
      status: "expired",
      payload: {
        source: "checkout_ttl",
        expiresAt: checkout.expiresAt,
      },
      processedAt,
    });
    if (result.event.outcome === "applied") {
      expired += 1;
    }
  });
  return expired;
};

const ensureUserCourseArtifacts = (
  db: ReturnType<typeof getDb>,
  params: { userId: string; email: string },
  updatedAt = nowIso()
) => {
  const user = db.users.find((candidate) => candidate.id === params.userId);
  if (!user || user.role !== "student") return false;
  let mutated = false;

  const userCheckouts = db.checkoutProcesses.filter(
    (checkout) =>
      (checkout.userId === params.userId ||
        normalizeEmail(checkout.email) === normalizeEmail(params.email)) &&
      isPositiveCheckoutState(checkout.state)
  );

  userCheckouts.forEach((checkout) => {
    if (!checkout.userId) {
      checkout.userId = params.userId;
      checkout.email = user.email;
      checkout.updatedAt = updatedAt;
      mutated = true;
    }
    const beforeState = checkout.state;
    ensureCheckoutProvisioned(db, checkout, updatedAt);
    if (checkout.state !== beforeState) mutated = true;
  });

  const verified = isIdentityVerified(db, {
    userId: params.userId,
    email: user.email,
  });

  const userPurchases = db.purchases.filter(
    (purchase) => purchase.userId === params.userId
  );

  userPurchases.forEach((purchase) => {
    const linkedCheckout = userCheckouts
      .filter((checkout) => checkout.courseId === purchase.courseId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    upsertCourseEntitlement(
      db,
      {
        userId: params.userId,
        courseId: purchase.courseId,
        sourceId: linkedCheckout?.id ?? `legacy-purchase:${purchase.id}`,
        activate: verified,
      },
      updatedAt
    );
  });

  const activeCourseEntitlements = db.entitlements.filter(
    (record) =>
      record.userId === params.userId &&
      record.kind === "course_access" &&
      record.state === "active" &&
      typeof record.courseId === "string"
  );

  activeCourseEntitlements.forEach((entitlement) => {
    const courseId = entitlement.courseId as string;
    const hasPurchase = db.purchases.some(
      (purchase) => purchase.userId === params.userId && purchase.courseId === courseId
    );
    if (hasPurchase) return;
    const course = db.courses.find((item) => item.id === courseId);
    if (!course) return;
    const fallbackCheckout = userCheckouts
      .filter((checkout) => checkout.courseId === courseId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const lessonsSnapshot = db.lessons
      .filter((lesson) => lesson.courseId === courseId)
      .sort((a, b) => a.order - b.order);
    const purchasedTestItemIds = getPurchasedTestItemIdsForCourse(db, courseId);
    db.purchases.push({
      id: ensureId(),
      userId: params.userId,
      courseId,
      price: fallbackCheckout?.amount ?? course.priceSelf ?? 0,
      purchasedAt: updatedAt,
      paymentMethod: fallbackCheckout?.method ?? "unknown",
      checkoutId: fallbackCheckout?.id,
      bnpl:
        fallbackCheckout?.method === "bnpl"
          ? buildBnplPurchaseSnapshot({
              amount: fallbackCheckout?.amount ?? course.priceSelf ?? 0,
              purchasedAt: updatedAt,
              selectedInstallmentsCount: fallbackCheckout?.bnplInstallmentsCount,
            })
          : undefined,
      courseSnapshot: JSON.parse(JSON.stringify(course)),
      lessonsSnapshot: JSON.parse(JSON.stringify(lessonsSnapshot)),
      purchasedTestItemIds,
    });
    mutated = true;
  });

  return mutated;
};

const applyPaymentStatusToCheckout = (
  db: ReturnType<typeof getDb>,
  checkout: CheckoutProcess,
  status: PaymentEventStatus,
  updatedAt = nowIso()
): PaymentEventOutcome => {
  if (status === "awaiting_payment") {
    if (
      checkout.state === "created" ||
      checkout.state === "failed" ||
      checkout.state === "canceled" ||
      checkout.state === "expired"
    ) {
      setCheckoutState(checkout, "awaiting_payment", updatedAt);
      return "applied";
    }
    return checkout.state === "awaiting_payment"
      ? "duplicate"
      : "ignored_out_of_order";
  }

  if (status === "paid") {
    if (checkout.state === "created") {
      setCheckoutState(checkout, "awaiting_payment", updatedAt);
    }
    if (
      checkout.state === "awaiting_payment" ||
      checkout.state === "failed" ||
      checkout.state === "canceled" ||
      checkout.state === "expired"
    ) {
      setCheckoutState(checkout, "paid", updatedAt);
    }
    ensureCheckoutProvisioned(db, checkout, updatedAt);
    return checkout.state === "provisioned" ? "applied" : "ignored_out_of_order";
  }

  const negativeTarget: CheckoutState =
    status === "failed"
      ? "failed"
      : status === "canceled"
      ? "canceled"
      : "expired";
  if (
    checkout.state === "paid" ||
    checkout.state === "provisioning" ||
    checkout.state === "provisioned"
  ) {
    return "ignored_out_of_order";
  }
  if (checkout.state === negativeTarget) {
    return "duplicate";
  }
  setCheckoutState(checkout, negativeTarget, updatedAt);
  return "applied";
};

const processPaymentEvent = (
  db: ReturnType<typeof getDb>,
  params: {
    provider: PaymentEventProvider;
    externalEventId: string;
    checkoutId: string;
    status: PaymentEventStatus;
    payload?: unknown;
    processedAt?: string;
  }
): { event: PaymentEventRecord; checkout: CheckoutProcess | null } => {
  const processedAt = params.processedAt ?? nowIso();
  const dedupeKey = `${params.provider}:${params.externalEventId}`;
  const duplicate = db.paymentEvents.find((event) => event.dedupeKey === dedupeKey);
  if (duplicate) {
    const existingCheckout =
      db.checkoutProcesses.find((item) => item.id === duplicate.checkoutId) ?? null;
    return { event: duplicate, checkout: existingCheckout };
  }

  const checkout =
    db.checkoutProcesses.find((item) => item.id === params.checkoutId) ?? null;
  let outcome: PaymentEventOutcome = "applied";

  if (!checkout) {
    outcome = "ignored_missing_checkout";
  } else {
    outcome = applyPaymentStatusToCheckout(
      db,
      checkout,
      params.status,
      processedAt
    );
  }

  const event: PaymentEventRecord = {
    id: ensureId(),
    provider: params.provider,
    externalEventId: params.externalEventId,
    dedupeKey,
    checkoutId: params.checkoutId,
    status: params.status,
    payload: serializeEventPayload(params.payload),
    outcome,
    createdAt: processedAt,
    processedAt,
  };
  db.paymentEvents.push(event);
  return { event, checkout };
};

type ReconciliationIssue = {
  code: ReconciliationIssueCode;
  userId: string;
  courseId: string;
  severity: "low" | "medium" | "high";
  details: string;
  checkoutIds: string[];
  purchaseIds: string[];
};

const hasActiveCourseEntitlement = (
  db: ReturnType<typeof getDb>,
  userId: string,
  courseId: string
) =>
  db.entitlements.some(
    (record) =>
      record.userId === userId &&
      record.kind === "course_access" &&
      record.courseId === courseId &&
      record.state === "active"
  );

type AccessRole = "anonymous" | "student" | "teacher";
type AccessMode = "none" | "preview" | "full";
type AccessReason =
  | "ok"
  | "anonymous"
  | "identity_unverified"
  | "entitlement_missing"
  | "course_not_found"
  | "lesson_not_found";

type CourseAccessDecision = {
  courseId: string;
  role: AccessRole;
  mode: AccessMode;
  reason: AccessReason;
  canViewCourse: boolean;
  canAccessPreviewLesson: boolean;
  canAccessAllLessons: boolean;
  hasActiveCourseEntitlement: boolean;
  isIdentityVerified: boolean;
  requiresAuth: boolean;
  requiresVerification: boolean;
};

type LessonAccessDecision = {
  lessonId: string;
  courseId: string | null;
  lessonOrder: number | null;
  role: AccessRole;
  mode: AccessMode;
  reason: AccessReason;
  canAccess: boolean;
  hasActiveCourseEntitlement: boolean;
  isIdentityVerified: boolean;
  requiresAuth: boolean;
  requiresVerification: boolean;
  resolvedFromSnapshot: boolean;
  lesson: Lesson | null;
};

type AccessContext = {
  role: AccessRole;
  userId?: string;
  isIdentityVerified: boolean;
  requiresAuth: boolean;
  requiresVerification: boolean;
};

const resolveAccessContext = (
  db: ReturnType<typeof getDb>,
  userId?: string
): AccessContext => {
  if (!userId) {
    return {
      role: "anonymous",
      isIdentityVerified: false,
      requiresAuth: true,
      requiresVerification: false,
    };
  }
  const user = db.users.find((item) => item.id === userId);
  if (!user) {
    return {
      role: "anonymous",
      isIdentityVerified: false,
      requiresAuth: true,
      requiresVerification: false,
    };
  }
  if (user.role === "teacher") {
    return {
      role: "teacher",
      userId: user.id,
      isIdentityVerified: true,
      requiresAuth: false,
      requiresVerification: false,
    };
  }
  const verified = isIdentityVerified(db, {
    userId: user.id,
    email: user.email,
  });
  return {
    role: "student",
    userId: user.id,
    isIdentityVerified: verified,
    requiresAuth: false,
    requiresVerification: !verified,
  };
};

const buildCourseAccessDecision = (
  db: ReturnType<typeof getDb>,
  courseId: string,
  userId?: string
): CourseAccessDecision => {
  const context = resolveAccessContext(db, userId);
  const courseExists = db.courses.some((course) => course.id === courseId);
  if (!courseExists) {
    return {
      courseId,
      role: context.role,
      mode: "none",
      reason: "course_not_found",
      canViewCourse: false,
      canAccessPreviewLesson: false,
      canAccessAllLessons: false,
      hasActiveCourseEntitlement: false,
      isIdentityVerified: context.isIdentityVerified,
      requiresAuth: context.requiresAuth,
      requiresVerification: context.requiresVerification,
    };
  }

  if (context.role === "teacher") {
    return {
      courseId,
      role: "teacher",
      mode: "full",
      reason: "ok",
      canViewCourse: true,
      canAccessPreviewLesson: true,
      canAccessAllLessons: true,
      hasActiveCourseEntitlement: true,
      isIdentityVerified: true,
      requiresAuth: false,
      requiresVerification: false,
    };
  }

  if (context.role === "anonymous" || !context.userId) {
    return {
      courseId,
      role: "anonymous",
      mode: "preview",
      reason: "anonymous",
      canViewCourse: true,
      canAccessPreviewLesson: true,
      canAccessAllLessons: false,
      hasActiveCourseEntitlement: false,
      isIdentityVerified: false,
      requiresAuth: true,
      requiresVerification: false,
    };
  }

  const hasEntitlement = hasActiveCourseEntitlement(db, context.userId, courseId);
  if (hasEntitlement && context.isIdentityVerified) {
    return {
      courseId,
      role: "student",
      mode: "full",
      reason: "ok",
      canViewCourse: true,
      canAccessPreviewLesson: true,
      canAccessAllLessons: true,
      hasActiveCourseEntitlement: true,
      isIdentityVerified: true,
      requiresAuth: false,
      requiresVerification: false,
    };
  }

  return {
    courseId,
    role: "student",
    mode: "preview",
    reason: context.isIdentityVerified
      ? "entitlement_missing"
      : "identity_unverified",
    canViewCourse: true,
    canAccessPreviewLesson: true,
    canAccessAllLessons: false,
    hasActiveCourseEntitlement: hasEntitlement,
    isIdentityVerified: context.isIdentityVerified,
    requiresAuth: false,
    requiresVerification: !context.isIdentityVerified,
  };
};

const resolveLessonForAccess = (
  db: ReturnType<typeof getDb>,
  lessonId: string,
  userId?: string
) => {
  const direct = db.lessons.find((lesson) => lesson.id === lessonId) ?? null;
  if (direct) {
    return { lesson: direct, resolvedFromSnapshot: false };
  }
  if (!userId) {
    return { lesson: null, resolvedFromSnapshot: false };
  }
  const purchase = db.purchases.find(
    (item) =>
      item.userId === userId &&
      Array.isArray(item.lessonsSnapshot) &&
      item.lessonsSnapshot.some((lesson) => lesson.id === lessonId)
  );
  if (!purchase?.lessonsSnapshot) {
    return { lesson: null, resolvedFromSnapshot: false };
  }
  const snapshotLesson =
    purchase.lessonsSnapshot.find((lesson) => lesson.id === lessonId) ?? null;
  return { lesson: snapshotLesson, resolvedFromSnapshot: Boolean(snapshotLesson) };
};

const buildLessonAccessDecision = (
  db: ReturnType<typeof getDb>,
  lessonId: string,
  userId?: string
): LessonAccessDecision => {
  const context = resolveAccessContext(db, userId);
  const resolved = resolveLessonForAccess(db, lessonId, context.userId);
  const lesson = resolved.lesson;
  if (!lesson) {
    return {
      lessonId,
      courseId: null,
      lessonOrder: null,
      role: context.role,
      mode: "none",
      reason: "lesson_not_found",
      canAccess: false,
      hasActiveCourseEntitlement: false,
      isIdentityVerified: context.isIdentityVerified,
      requiresAuth: context.requiresAuth,
      requiresVerification: context.requiresVerification,
      resolvedFromSnapshot: false,
      lesson: null,
    };
  }

  const courseDecision = buildCourseAccessDecision(db, lesson.courseId, context.userId);
  const previewAllowed = courseDecision.mode === "preview" && lesson.order === 1;
  const canAccess = courseDecision.mode === "full" || previewAllowed;
  const mode: AccessMode = canAccess
    ? courseDecision.mode === "full"
      ? "full"
      : "preview"
    : courseDecision.mode;

  return {
    lessonId,
    courseId: lesson.courseId,
    lessonOrder: lesson.order,
    role: courseDecision.role,
    mode,
    reason: courseDecision.reason,
    canAccess,
    hasActiveCourseEntitlement: courseDecision.hasActiveCourseEntitlement,
    isIdentityVerified: courseDecision.isIdentityVerified,
    requiresAuth: courseDecision.requiresAuth,
    requiresVerification: courseDecision.requiresVerification,
    resolvedFromSnapshot: resolved.resolvedFromSnapshot,
    lesson,
  };
};

const hasPaymentReversalEvent = (
  db: ReturnType<typeof getDb>,
  checkoutIds: string[]
) => {
  if (checkoutIds.length === 0) return false;
  return db.paymentEvents.some(
    (event) =>
      checkoutIds.includes(event.checkoutId) &&
      (event.status === "failed" ||
        event.status === "canceled" ||
        event.status === "expired")
  );
};

const buildReconciliationIssues = (
  db: ReturnType<typeof getDb>,
  filters?: { userId?: string; courseId?: string }
): ReconciliationIssue[] => {
  const scopePurchases = db.purchases.filter((purchase) => {
    if (filters?.userId && purchase.userId !== filters.userId) return false;
    if (filters?.courseId && purchase.courseId !== filters.courseId) return false;
    return true;
  });
  const checkoutScope = db.checkoutProcesses.filter((checkout) => {
    if (filters?.userId && checkout.userId !== filters.userId) return false;
    if (filters?.courseId && checkout.courseId !== filters.courseId) return false;
    return true;
  });

  const index = new Map<
    string,
    {
      userId: string;
      courseId: string;
      purchaseIds: string[];
      checkoutIds: string[];
      paidCheckoutIds: string[];
      reversalSeen: boolean;
    }
  >();

  const touch = (userId: string, courseId: string) => {
    const key = `${userId}:${courseId}`;
    const existing = index.get(key);
    if (existing) return existing;
    const created = {
      userId,
      courseId,
      purchaseIds: [] as string[],
      checkoutIds: [] as string[],
      paidCheckoutIds: [] as string[],
      reversalSeen: false,
    };
    index.set(key, created);
    return created;
  };

  scopePurchases.forEach((purchase) => {
    const item = touch(purchase.userId, purchase.courseId);
    item.purchaseIds.push(purchase.id);
  });

  checkoutScope.forEach((checkout) => {
    if (!checkout.userId) return;
    const item = touch(checkout.userId, checkout.courseId);
    item.checkoutIds.push(checkout.id);
    if (checkout.state === "paid" || checkout.state === "provisioned") {
      item.paidCheckoutIds.push(checkout.id);
    }
  });

  index.forEach((item) => {
    item.reversalSeen = hasPaymentReversalEvent(db, item.checkoutIds);
  });

  const issues: ReconciliationIssue[] = [];
  index.forEach((item) => {
    const hasPurchase = item.purchaseIds.length > 0;
    const hasPaidCheckout = item.paidCheckoutIds.length > 0;
    const hasEntitlement = hasActiveCourseEntitlement(
      db,
      item.userId,
      item.courseId
    );

    if (hasPaidCheckout && (!hasPurchase || !hasEntitlement)) {
      issues.push({
        code: "paid_without_access",
        userId: item.userId,
        courseId: item.courseId,
        severity: "high",
        details:
          "Есть подтвержденная оплата, но отсутствует покупка или активный entitlement.",
        checkoutIds: item.checkoutIds,
        purchaseIds: item.purchaseIds,
      });
    }

    if (hasPurchase && !hasPaidCheckout) {
      issues.push({
        code: "access_without_paid",
        userId: item.userId,
        courseId: item.courseId,
        severity: "high",
        details:
          "Есть покупка, но нет подтвержденного checkout в состояниях paid/provisioned.",
        checkoutIds: item.checkoutIds,
        purchaseIds: item.purchaseIds,
      });
    }

    if (item.paidCheckoutIds.length > 1) {
      issues.push({
        code: "multiple_paid_checkouts",
        userId: item.userId,
        courseId: item.courseId,
        severity: "medium",
        details:
          "Для одного курса обнаружено несколько подтвержденных checkout-попыток.",
        checkoutIds: item.checkoutIds,
        purchaseIds: item.purchaseIds,
      });
    }

    if (item.purchaseIds.length > 1) {
      issues.push({
        code: "duplicate_purchases",
        userId: item.userId,
        courseId: item.courseId,
        severity: "medium",
        details:
          "Обнаружены дубликаты покупок одного и того же курса для пользователя.",
        checkoutIds: item.checkoutIds,
        purchaseIds: item.purchaseIds,
      });
    }

    if (item.reversalSeen && (hasPurchase || hasEntitlement)) {
      issues.push({
        code: "refunded_with_access",
        userId: item.userId,
        courseId: item.courseId,
        severity: "high",
        details:
          "Зафиксирован отмененный/неуспешный платеж, но доступ пользователя еще активен.",
        checkoutIds: item.checkoutIds,
        purchaseIds: item.purchaseIds,
      });
    }
  });

  return issues;
};

const logSupportAction = (
  db: ReturnType<typeof getDb>,
  params: {
    type: SupportActionType;
    issueCode?: ReconciliationIssueCode;
    userId?: string;
    courseId?: string;
    checkoutId?: string;
    notes?: string;
  },
  createdAt = nowIso()
) => {
  const record: SupportActionRecord = {
    id: ensureId(),
    type: params.type,
    issueCode: params.issueCode,
    userId: params.userId,
    courseId: params.courseId,
    checkoutId: params.checkoutId,
    notes: params.notes,
    createdAt,
  };
  db.supportActions.push(record);
};

const revokeCourseAccess = (
  db: ReturnType<typeof getDb>,
  params: { userId: string; courseId: string; notes?: string },
  updatedAt = nowIso()
) => {
  const beforePurchases = db.purchases.length;
  db.purchases = db.purchases.filter(
    (purchase) =>
      !(purchase.userId === params.userId && purchase.courseId === params.courseId)
  );
  const purchasesRemoved = beforePurchases - db.purchases.length;

  const beforeProgress = db.progress.length;
  db.progress = db.progress.filter(
    (progress) =>
      !(progress.userId === params.userId && progress.courseId === params.courseId)
  );
  const progressRemoved = beforeProgress - db.progress.length;

  let revoked = 0;
  db.entitlements.forEach((record) => {
    if (
      record.userId !== params.userId ||
      record.kind !== "course_access" ||
      record.courseId !== params.courseId
    ) {
      return;
    }
    if (record.state === "revoked") return;
    assertEntitlementTransition(record.state, "revoked");
    record.state = "revoked";
    record.updatedAt = updatedAt;
    revoked += 1;
  });

  return { purchasesRemoved, progressRemoved, revokedEntitlements: revoked };
};

const restoreCourseAccessFromPaidCheckout = (
  db: ReturnType<typeof getDb>,
  params: { userId: string; courseId: string; checkoutId?: string },
  updatedAt = nowIso()
) => {
  const checkoutCandidates = db.checkoutProcesses
    .filter(
      (checkout) =>
        checkout.userId === params.userId && checkout.courseId === params.courseId
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const checkout =
    (params.checkoutId
      ? checkoutCandidates.find((item) => item.id === params.checkoutId)
      : checkoutCandidates.find(
          (item) => item.state === "paid" || item.state === "provisioned"
        )) ?? null;
  if (!checkout) {
    return { restored: false, reason: "checkout_not_found" as const };
  }
  if (checkout.state === "created" || checkout.state === "awaiting_payment") {
    return { restored: false, reason: "checkout_not_paid" as const };
  }
  if (
    checkout.state === "failed" ||
    checkout.state === "canceled" ||
    checkout.state === "expired"
  ) {
    return { restored: false, reason: "checkout_negative_state" as const };
  }
  ensureCheckoutProvisioned(db, checkout, updatedAt);
  return { restored: true, checkoutId: checkout.id };
};

const dedupePurchasesForCourse = (
  db: ReturnType<typeof getDb>,
  params: { userId: string; courseId: string }
) => {
  const duplicates = db.purchases
    .filter(
      (purchase) =>
        purchase.userId === params.userId && purchase.courseId === params.courseId
    )
    .sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));
  if (duplicates.length <= 1) return { removed: 0 };
  const keep = duplicates[0]?.id;
  const before = db.purchases.length;
  db.purchases = db.purchases.filter(
    (purchase) =>
      !(
        purchase.userId === params.userId &&
        purchase.courseId === params.courseId &&
        purchase.id !== keep
      )
  );
  return { removed: before - db.purchases.length };
};

const enforceSingleTeacherIdentity = (db: ReturnType<typeof getDb>) => {
  if (!primaryTeacherEmail) return;

  let mutated = false;
  const removedUserIds = new Set<string>();

  let primaryTeacher =
    db.users.find(
      (user) =>
        user.role === "teacher" && normalizeEmail(user.email) === primaryTeacherEmail
    ) ?? null;

  if (!primaryTeacher) {
    const sameEmailUser = db.users.find(
      (user) => normalizeEmail(user.email) === primaryTeacherEmail
    );
    if (sameEmailUser) {
      sameEmailUser.role = "teacher";
      sameEmailUser.password = "magic";
      sameEmailUser.email = primaryTeacherEmail;
      primaryTeacher = sameEmailUser;
      mutated = true;
    }
  }

  if (!primaryTeacher) {
    primaryTeacher = {
      id: ensureId(),
      email: primaryTeacherEmail,
      firstName: "Анна",
      lastName: "Калугина",
      role: "teacher",
      password: "magic",
    };
    db.users.push(primaryTeacher);
    mutated = true;
  }

  if (
    primaryTeacher.role !== "teacher" ||
    normalizeEmail(primaryTeacher.email) !== primaryTeacherEmail ||
    primaryTeacher.password !== "magic"
  ) {
    primaryTeacher.role = "teacher";
    primaryTeacher.email = primaryTeacherEmail;
    primaryTeacher.password = "magic";
    mutated = true;
  }

  db.users.forEach((user) => {
    if (user.id === primaryTeacher!.id) return;
    const isLegacyTeacher = user.role === "teacher";
    const isPrimaryTeacherEmail = normalizeEmail(user.email) === primaryTeacherEmail;
    if (isLegacyTeacher || isPrimaryTeacherEmail) {
      removedUserIds.add(user.id);
    }
  });

  if (removedUserIds.size > 0) {
    const prevUsersLength = db.users.length;
    db.users = db.users.filter((user) => !removedUserIds.has(user.id));
    mutated = mutated || db.users.length !== prevUsersLength;

    const prevPurchasesLength = db.purchases.length;
    db.purchases = db.purchases.filter((purchase) => !removedUserIds.has(purchase.userId));
    mutated = mutated || db.purchases.length !== prevPurchasesLength;

    const prevProgressLength = db.progress.length;
    db.progress = db.progress.filter((item) => !removedUserIds.has(item.userId));
    mutated = mutated || db.progress.length !== prevProgressLength;
  }

  const primaryTeacherId = primaryTeacher.id;

  const nextTeacherProfiles: typeof db.teacherProfiles = {};
  if (db.teacherProfiles[primaryTeacherId]) {
    nextTeacherProfiles[primaryTeacherId] = db.teacherProfiles[primaryTeacherId];
  }
  if (
    Object.keys(db.teacherProfiles).length !== Object.keys(nextTeacherProfiles).length
  ) {
    db.teacherProfiles = nextTeacherProfiles;
    mutated = true;
  }

  const nextTeacherAvailability: typeof db.teacherAvailability = {};
  if (db.teacherAvailability[primaryTeacherId]) {
    nextTeacherAvailability[primaryTeacherId] = db.teacherAvailability[primaryTeacherId];
  }
  if (
    Object.keys(db.teacherAvailability).length !==
    Object.keys(nextTeacherAvailability).length
  ) {
    db.teacherAvailability = nextTeacherAvailability;
    mutated = true;
  }

  const prevNewsLength = db.news.length;
  db.news = db.news
    .filter((item) => item.authorId === primaryTeacherId)
    .map((item) => ({
      ...item,
      authorName:
        `${primaryTeacher!.firstName} ${primaryTeacher!.lastName}`.trim() ||
        primaryTeacher!.email,
    }));
  mutated = mutated || db.news.length !== prevNewsLength;

  const prevBookingsLength = db.bookings.length;
  db.bookings = db.bookings
    .filter(
      (booking) =>
        booking.teacherId === primaryTeacherId &&
        !removedUserIds.has(booking.studentId)
    )
    .map((booking) => ({
      ...booking,
      teacherName:
        `${primaryTeacher!.firstName} ${primaryTeacher!.lastName}`.trim() ||
        primaryTeacher!.email,
      teacherPhoto: primaryTeacher!.photo,
    }));
  mutated = mutated || db.bookings.length !== prevBookingsLength;

  const prevChatThreadsLength = db.chatThreads.length;
  db.chatThreads = db.chatThreads
    .filter(
      (thread) =>
        thread.teacherId === primaryTeacherId &&
        !removedUserIds.has(thread.studentId)
    )
    .map((thread) => ({
      ...thread,
      teacherId: primaryTeacherId,
    }));
  mutated = mutated || db.chatThreads.length !== prevChatThreadsLength;
  const validChatThreadIds = new Set(db.chatThreads.map((thread) => thread.id));

  const prevChatMessagesLength = db.chatMessages.length;
  db.chatMessages = db.chatMessages.filter((message) => {
    if (!validChatThreadIds.has(message.threadId)) return false;
    if (removedUserIds.has(message.senderId)) return false;
    return true;
  });
  mutated = mutated || db.chatMessages.length !== prevChatMessagesLength;

  const prevWorkbookParticipantsLength = db.workbookParticipants.length;
  db.workbookParticipants = db.workbookParticipants.filter(
    (participant) => !removedUserIds.has(participant.userId)
  );
  mutated =
    mutated || db.workbookParticipants.length !== prevWorkbookParticipantsLength;

  const participantsBySession = db.workbookParticipants.reduce<Record<string, number>>(
    (acc, participant) => {
      acc[participant.sessionId] = (acc[participant.sessionId] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const prevWorkbookSessionsLength = db.workbookSessions.length;
  db.workbookSessions = db.workbookSessions.filter((session) => {
    if (removedUserIds.has(session.createdBy)) return false;
    if (!participantsBySession[session.id]) return false;
    return true;
  });
  mutated = mutated || db.workbookSessions.length !== prevWorkbookSessionsLength;
  const validWorkbookSessionIds = new Set(
    db.workbookSessions.map((session) => session.id)
  );

  const prevWorkbookDraftsLength = db.workbookDrafts.length;
  db.workbookDrafts = db.workbookDrafts.filter(
    (draft) =>
      validWorkbookSessionIds.has(draft.sessionId) &&
      !removedUserIds.has(draft.ownerUserId)
  );
  mutated = mutated || db.workbookDrafts.length !== prevWorkbookDraftsLength;

  const prevWorkbookInvitesLength = db.workbookInvites.length;
  db.workbookInvites = db.workbookInvites.filter(
    (invite) =>
      validWorkbookSessionIds.has(invite.sessionId) &&
      !removedUserIds.has(invite.createdBy)
  );
  mutated = mutated || db.workbookInvites.length !== prevWorkbookInvitesLength;

  const prevWorkbookEventsLength = db.workbookEvents.length;
  db.workbookEvents = db.workbookEvents.filter(
    (event) =>
      validWorkbookSessionIds.has(event.sessionId) &&
      !removedUserIds.has(event.authorUserId)
  );
  mutated = mutated || db.workbookEvents.length !== prevWorkbookEventsLength;

  const prevWorkbookSnapshotsLength = db.workbookSnapshots.length;
  db.workbookSnapshots = db.workbookSnapshots.filter((snapshot) =>
    validWorkbookSessionIds.has(snapshot.sessionId)
  );
  mutated = mutated || db.workbookSnapshots.length !== prevWorkbookSnapshotsLength;

  const prevCheckoutLength = db.checkoutProcesses.length;
  db.checkoutProcesses = db.checkoutProcesses.filter((process) => {
    const processEmail = normalizeEmail(process.email);
    if (removedUserIds.has(process.userId ?? "")) return false;
    if (processEmail === primaryTeacherEmail) {
      return process.userId === primaryTeacherId;
    }
    return true;
  });
  mutated = mutated || db.checkoutProcesses.length !== prevCheckoutLength;
  const validCheckoutIds = new Set(db.checkoutProcesses.map((process) => process.id));

  const prevPaymentEventsLength = db.paymentEvents.length;
  db.paymentEvents = db.paymentEvents.filter((event) =>
    validCheckoutIds.has(event.checkoutId)
  );
  mutated = mutated || db.paymentEvents.length !== prevPaymentEventsLength;

  const prevEntitlementsLength = db.entitlements.length;
  db.entitlements = db.entitlements.filter(
    (record) => !removedUserIds.has(record.userId)
  );
  mutated = mutated || db.entitlements.length !== prevEntitlementsLength;

  const prevIdentityLength = db.identity.length;
  let identityMutated = false;
  db.identity = db.identity.filter((record) => {
    const recordEmail = normalizeEmail(record.email);
    const linkedToRemoved = record.userId ? removedUserIds.has(record.userId) : false;
    if (linkedToRemoved) return false;
    if (recordEmail === primaryTeacherEmail && record.userId !== primaryTeacherId) {
      return false;
    }
    return true;
  });
  if (
    !db.identity.some(
      (record) =>
        normalizeEmail(record.email) === primaryTeacherEmail &&
        record.userId === primaryTeacherId
    )
  ) {
    db.identity.push({
      email: primaryTeacherEmail,
      userId: primaryTeacherId,
      state: "verified",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    identityMutated = true;
  }
  mutated =
    mutated || identityMutated || db.identity.length !== prevIdentityLength;

  const prevConsentsLength = db.consents.length;
  let consentsMutated = false;
  db.consents = db.consents.filter((record) => {
    if (record.userId && removedUserIds.has(record.userId)) return false;
    const consentEmail = normalizeEmail(record.email);
    if (consentEmail === primaryTeacherEmail) {
      if (record.userId !== primaryTeacherId) {
        record.userId = primaryTeacherId;
        consentsMutated = true;
      }
      if (record.email !== primaryTeacherEmail) {
        record.email = primaryTeacherEmail;
        consentsMutated = true;
      }
    }
    return true;
  });
  mutated = mutated || consentsMutated || db.consents.length !== prevConsentsLength;

  const bookingIds = new Set(db.bookings.map((booking) => booking.id));
  const prevLifecycleLength = db.bookingLifecycle.length;
  db.bookingLifecycle = db.bookingLifecycle.filter((record) =>
    bookingIds.has(record.bookingId)
  );
  mutated = mutated || db.bookingLifecycle.length !== prevLifecycleLength;

  const prevSupportActionsLength = db.supportActions.length;
  db.supportActions = db.supportActions.filter((record) => {
    if (record.userId && removedUserIds.has(record.userId)) return false;
    return true;
  });
  mutated = mutated || db.supportActions.length !== prevSupportActionsLength;

  const prevOutboxLength = db.outbox.length;
  db.outbox = db.outbox.filter((record) => {
    if (record.userId && removedUserIds.has(record.userId)) return false;
    if (
      normalizeEmail(record.recipientEmail) === primaryTeacherEmail &&
      record.userId &&
      record.userId !== primaryTeacherId
    ) {
      return false;
    }
    return true;
  });
  mutated = mutated || db.outbox.length !== prevOutboxLength;

  const prevSessionsLength = db.authSessions.length;
  db.authSessions = db.authSessions
    .filter((record) => !removedUserIds.has(record.userId))
    .map((record) => {
      if (record.userId !== primaryTeacherId) return record;
      if (
        record.email === primaryTeacherEmail &&
        record.role === "teacher"
      ) {
        return record;
      }
      return {
        ...record,
        email: primaryTeacherEmail,
        role: "teacher",
      };
    });
  mutated = mutated || db.authSessions.length !== prevSessionsLength;

  const prevCredentialsLength = db.authCredentials.length;
  db.authCredentials = db.authCredentials.filter(
    (record) => !removedUserIds.has(record.userId)
  );
  mutated = mutated || db.authCredentials.length !== prevCredentialsLength;
  if (!db.authCredentials.some((record) => record.userId === primaryTeacherId)) {
    db.authCredentials.push({
      userId: primaryTeacherId,
      algo: "scrypt-v1",
      state: "none",
      failedAttempts: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    mutated = true;
  }

  const prevOneTimeCodesLength = db.authOneTimeCodes.length;
  db.authOneTimeCodes = db.authOneTimeCodes.filter(
    (record) =>
      !removedUserIds.has(record.userId ?? "") &&
      (normalizeEmail(record.email) !== primaryTeacherEmail ||
        record.userId === primaryTeacherId ||
        !record.userId)
  );
  mutated = mutated || db.authOneTimeCodes.length !== prevOneTimeCodesLength;

  const prevResetTokensLength = db.passwordResetTokens.length;
  db.passwordResetTokens = db.passwordResetTokens.filter(
    (record) => !removedUserIds.has(record.userId)
  );
  mutated = mutated || db.passwordResetTokens.length !== prevResetTokensLength;

  const prevAuthAuditLength = db.authAudit.length;
  db.authAudit = db.authAudit.filter(
    (record) =>
      !removedUserIds.has(record.userId ?? "") &&
      (normalizeEmail(record.email) !== primaryTeacherEmail ||
        record.userId === primaryTeacherId)
  );
  mutated = mutated || db.authAudit.length !== prevAuthAuditLength;

  if (mutated) {
    saveDb();
  }
};

const resolveUserForEmailAuth = (
  db: ReturnType<typeof getDb>,
  email: string,
  timestamp = nowIso()
):
  | { ok: true; user: ReturnType<typeof getDb>["users"][number] }
  | { ok: false; status: number; error: string } => {
  const isTeacher = teacherEmailSet.has(email);
  const sameEmailUsers = db.users.filter(
    (candidate) => normalizeEmail(candidate.email) === email
  );
  let user =
    (isTeacher
      ? sameEmailUsers.find((candidate) => candidate.role === "teacher")
      : sameEmailUsers[0]) ?? null;
  let mutated = false;

  if (!user && isTeacher && sameEmailUsers.length > 0) {
    user = sameEmailUsers[0];
    user.role = "teacher";
    user.password = "magic";
    mutated = true;
  }

  if (!user && isTeacher) {
    user = {
      id: ensureId(),
      email,
      firstName: "Анна",
      lastName: "Калугина",
      role: "teacher",
      password: "magic",
    };
    db.users.push(user);
    mutated = true;
  }

  if (!user && !isTeacher) {
    const relatedCheckouts = db.checkoutProcesses
      .filter((checkout) => normalizeEmail(checkout.email) === email)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const paidCheckouts = relatedCheckouts.filter((checkout) =>
      isPositiveCheckoutState(checkout.state)
    );
    const pendingCheckouts = relatedCheckouts.filter(
      (checkout) =>
        checkout.state === "created" || checkout.state === "awaiting_payment"
    );

    if (paidCheckouts.length > 0) {
      const sourceCheckout = paidCheckouts[0];
      user = {
        id: ensureId(),
        email,
        firstName: sourceCheckout.profileDraft?.firstName?.trim() || "Ученик",
        lastName: sourceCheckout.profileDraft?.lastName?.trim() || "",
        phone: normalizePhoneStorage(sourceCheckout.profileDraft?.phone),
        role: "student",
        password: "magic",
      };
      db.users.push(user);
      upsertIdentityRecord(
        db,
        {
          email: user.email,
          userId: user.id,
          state: "known_unverified",
        },
        timestamp
      );
      relatedCheckouts.forEach((checkout) => {
        if (!checkout.userId) {
          checkout.userId = user!.id;
          checkout.email = user!.email;
          checkout.updatedAt = timestamp;
          mutated = true;
        }
      });
      mutated = true;
    } else if (pendingCheckouts.length > 0) {
      return {
        ok: false,
        status: 409,
        error:
          "Платеж найден, но еще не подтвержден. Дождитесь подтверждения банка и попробуйте войти снова.",
      };
    }
  }

  if (mutated) {
    saveDb();
  }

  if (!user) {
    return {
      ok: false,
      status: 404,
      error:
        "Пользователь не найден. Приобретение курса или запись на занятие создают аккаунт автоматически.",
    };
  }

  if (user.role === "student" && !isTeacher) {
    const hasPurchase = db.purchases.some((purchase) => purchase.userId === user!.id);
    const hasBooking = db.bookings.some((booking) => booking.studentId === user!.id);
    const hasCheckout = db.checkoutProcesses.some((checkout) => {
      const sameUser = checkout.userId === user!.id;
      const sameEmail =
        normalizeEmail(checkout.email) === normalizeEmail(user!.email);
      if (!sameUser && !sameEmail) return false;
      return (
        checkout.state === "created" ||
        checkout.state === "awaiting_payment" ||
        isPositiveCheckoutState(checkout.state)
      );
    });
    if (!hasPurchase && !hasBooking && !hasCheckout) {
      return {
        ok: false,
        status: 403,
        error:
          "У вас пока нет покупок и записей на занятия. Сначала оформите курс или запись.",
      };
    }
  }

  return { ok: true, user };
};

const finalizeEmailAuth = async (
  db: ReturnType<typeof getDb>,
  user: ReturnType<typeof getDb>["users"][number],
  timestamp = nowIso()
) => {
  upsertIdentityRecord(
    db,
    {
      email: user.email,
      userId: user.id,
      state: "verified",
    },
    timestamp
  );
  activatePendingEntitlements(db, user.id, timestamp);
  ensureUserCourseArtifacts(
    db,
    {
      userId: user.id,
      email: user.email,
    },
    timestamp
  );
  db.checkoutProcesses
    .filter(
      (checkout) =>
        checkout.userId === user.id &&
        isPositiveCheckoutState(checkout.state)
    )
    .forEach((checkout) => {
      queueCheckoutTransactionalEmail(db, checkout, timestamp);
    });
  await dispatchOutboxQueue(db, timestamp);
  captureConsent(
    db,
    {
      email: user.email,
      userId: user.id,
      scope: "auth",
    },
    timestamp
  );
  const session = createAuthSession(
    db,
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    timestamp
  );
  return session;
};

type ServerWithMiddlewares = Pick<ViteDevServer, "middlewares">;

type WorkbookStreamClient = {
  id: string;
  userId: string;
  res: import("http").ServerResponse;
  heartbeatTimer: ReturnType<typeof setInterval>;
};

const workbookStreamClientsBySession = new Map<string, Map<string, WorkbookStreamClient>>();

const removeWorkbookStreamClient = (sessionId: string, clientId: string) => {
  const sessionClients = workbookStreamClientsBySession.get(sessionId);
  if (!sessionClients) return;
  const client = sessionClients.get(clientId);
  if (!client) return;
  clearInterval(client.heartbeatTimer);
  sessionClients.delete(clientId);
  if (sessionClients.size === 0) {
    workbookStreamClientsBySession.delete(sessionId);
  }
};

const closeWorkbookStreamSession = (sessionId: string) => {
  const sessionClients = workbookStreamClientsBySession.get(sessionId);
  if (!sessionClients) return;
  Array.from(sessionClients.values()).forEach((client) => {
    clearInterval(client.heartbeatTimer);
    try {
      client.res.end();
    } catch {
      // ignore close errors
    }
  });
  workbookStreamClientsBySession.delete(sessionId);
};

const closeWorkbookStreamClientByUser = (sessionId: string, userId: string) => {
  const sessionClients = workbookStreamClientsBySession.get(sessionId);
  if (!sessionClients) return;
  Array.from(sessionClients.values()).forEach((client) => {
    if (client.userId !== userId) return;
    clearInterval(client.heartbeatTimer);
    try {
      client.res.end();
    } catch {
      // ignore close errors
    }
    sessionClients.delete(client.id);
  });
  if (sessionClients.size === 0) {
    workbookStreamClientsBySession.delete(sessionId);
  }
};

const publishWorkbookStreamEvents = (
  db: ReturnType<typeof getDb>,
  payload: {
    sessionId: string;
    latestSeq: number;
    events: Array<{
      id: string;
      sessionId: string;
      seq: number;
      authorUserId: string;
      type: string;
      payload: unknown;
      createdAt: string;
    }>;
  }
) => {
  const sessionClients = workbookStreamClientsBySession.get(payload.sessionId);
  if (!sessionClients || sessionClients.size === 0) return;

  const chunk = `event: workbook\ndata: ${JSON.stringify(payload)}\n\n`;
  Array.from(sessionClients.values()).forEach((client) => {
    const hasAccess = db.workbookParticipants.some(
      (participant) =>
        participant.sessionId === payload.sessionId && participant.userId === client.userId
    );
    if (!hasAccess || client.res.writableEnded || client.res.destroyed) {
      removeWorkbookStreamClient(payload.sessionId, client.id);
      return;
    }
    try {
      client.res.write(chunk);
    } catch {
      removeWorkbookStreamClient(payload.sessionId, client.id);
    }
  });
};

export function setupMockServer(server: ServerWithMiddlewares) {
  server.middlewares.use(async (req, res, next) => {
    if (!req.url || !req.url.startsWith("/api")) return next();

    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const db = getDb();
    ensureDomainCollections(db);
    enforceSingleTeacherIdentity(db);
    pruneWorkbookArtifacts(db);
    pruneAuthSessions(db);
    pruneTeacherAvailability(db);
    normalizeBookingRecords(db);
    const expiredResetTokenMutated = prunePasswordResetTokens(db);
    const expiredAuthCodeMutated = pruneAuthOneTimeCodes(db);
    const expiredCheckoutCount = expireStaleCheckouts(db);
    const expiredIdempotencyMutated = pruneIdempotencyRecords(db);
    if (
      expiredCheckoutCount > 0 ||
      expiredResetTokenMutated ||
      expiredAuthCodeMutated ||
      expiredIdempotencyMutated
    ) {
      saveDb();
    }
    const sessionActor = resolveSessionActor(db, req);
    const actorUser = sessionActor?.user ?? null;
    const actorSession = sessionActor?.session ?? null;

    try {
      // ================= AUTH =================
      if (path === "/api/dev/reset" && method === "POST") {
        resetDb();
        clearSessionCookie(res);
        return json(res, 200, { ok: true });
      }

      if (path === "/api/telemetry/rum" && method === "POST") {
        const body = (await readBody(req)) as {
          events?: Array<{
            type?: string;
            payload?: unknown;
            route?: string;
            at?: string;
          }>;
        };
        const events = Array.isArray(body?.events) ? body.events.slice(0, 100) : [];
        const timestamp = nowIso();

        if (events.length > 0) {
          events.forEach((event) => {
            const eventType =
              typeof event?.type === "string" && event.type.trim().length > 0
                ? event.type.trim()
                : "unknown";
            const route =
              typeof event?.route === "string" && event.route.trim().length > 0
                ? event.route.trim()
                : undefined;
            db.rumTelemetry.push({
              id: ensureId(),
              type: eventType,
              payload: safeStringify(event?.payload ?? {}),
              route,
              userId: actorUser?.id ?? null,
              createdAt:
                typeof event?.at === "string" && event.at.trim().length > 0
                  ? event.at
                  : timestamp,
            });
          });

          if (db.rumTelemetry.length > 2000) {
            db.rumTelemetry = db.rumTelemetry
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 2000);
          }
          saveDb();
        }

        return json(res, 202, { ok: true, accepted: events.length });
      }

      if (path === "/api/legal/consent-policy" && method === "GET") {
        return json(res, 200, {
          documentVersion: LEGAL_DOCUMENT_VERSION,
          checkoutRequiredScopes: ["terms", "privacy", "checkout"],
          trialBookingRequiredScopes: ["terms", "privacy", "trial_booking"],
        });
      }

      if (path === "/api/auth/session" && method === "GET") {
        if (!actorSession || !actorUser) {
          clearSessionCookie(res);
          return json(res, 200, null);
        }
        return json(res, 200, safeUser(actorUser));
      }

      if (path === "/api/auth/logout" && method === "POST") {
        if (actorSession) {
          revokeAuthSession(db, actorSession.id, nowIso());
          saveDb();
        }
        clearSessionCookie(res);
        return json(res, 200, { ok: true });
      }

      if (path === "/api/auth/magic-link" && method === "POST") {
        const body = (await readBody(req)) as { email: string };
        const email = canonicalizeTeacherLoginEmail(normalizeEmail(body?.email));
        if (!email) {
          return json(res, 400, { error: "Email обязателен" });
        }

        const authTimestamp = nowIso();
        const resolved = resolveUserForEmailAuth(db, email, authTimestamp);
        if (!resolved.ok) {
          registerAuthAudit(
            db,
            {
              action: "magic_code_failed",
              email,
              metadata: { reason: resolved.error, status: resolved.status },
            },
            authTimestamp
          );
          saveDb();
          // Domain-level denial is returned as 200 to avoid noisy transport errors in UI.
          return json(res, 200, {
            ok: false,
            message: resolved.error,
            expiresAt: null,
            debugCode: null,
          });
        }

        const issued = issueAuthOneTimeCode(
          db,
          { email, userId: resolved.user.id },
          authTimestamp
        );
        if (!issued) {
          return json(res, 500, { error: "Не удалось сгенерировать код входа." });
        }

        enqueueOutboxEmail(
          db,
          {
            template: "auth_code",
            dedupeKey: `auth_code:${email}:${getDedupeMinuteWindow(authTimestamp)}`,
            recipientEmail: email,
            userId: resolved.user.id,
            authCode: issued.rawCode,
            recommendation: "login",
          },
          authTimestamp
        );
        await dispatchOutboxQueue(db, authTimestamp);
        registerAuthAudit(
          db,
          {
            action: "magic_code_requested",
            userId: resolved.user.id,
            email,
          },
          authTimestamp
        );
        saveDb();

        return json(res, 200, {
          ok: true,
          message: "Код входа отправлен на email. Введите его в форме, чтобы завершить вход.",
          expiresAt: issued.code.expiresAt,
          debugCode: AUTH_DEBUG_TOKENS ? issued.rawCode : null,
        });
      }

      if (path === "/api/auth/magic-link/confirm" && method === "POST") {
        const body = (await readBody(req)) as { email?: string; code?: string };
        const email = canonicalizeTeacherLoginEmail(normalizeEmail(body?.email));
        const code =
          typeof body?.code === "string" ? body.code.replace(/\\s+/g, "") : "";
        if (!email || !code) {
          return json(res, 400, { error: "Введите email и код подтверждения." });
        }

        const authTimestamp = nowIso();
        const actorEmail = normalizeEmail(actorUser?.email);
        if (actorSession && actorUser && actorEmail && actorEmail !== email) {
          revokeAuthSession(db, actorSession.id, authTimestamp);
          clearSessionCookie(res);
          saveDb();
        }

        const verifyResult = confirmAuthOneTimeCode(
          db,
          { email, rawCode: code },
          authTimestamp
        );
        if (!verifyResult.ok) {
          registerAuthAudit(
            db,
            {
              action:
                verifyResult.reason === "expired"
                  ? "magic_code_expired"
                  : "magic_code_failed",
              email,
              metadata: { reason: verifyResult.reason },
            },
            authTimestamp
          );
          saveDb();
          if (verifyResult.reason === "expired") {
            return json(res, 409, {
              error:
                "Срок действия кода истек. Запросите новый код и повторите вход.",
            });
          }
          if (verifyResult.reason === "too_many_attempts") {
            return json(res, 429, {
              error:
                "Слишком много неверных попыток. Запросите новый код входа.",
            });
          }
          return json(res, 401, { error: "Неверный код подтверждения." });
        }

        const resolved = resolveUserForEmailAuth(db, email, authTimestamp);
        if (!resolved.ok) {
          return json(res, resolved.status, { error: resolved.error });
        }

        const session = await finalizeEmailAuth(db, resolved.user, authTimestamp);
        setSessionCookie(res, session.id);
        registerAuthAudit(
          db,
          {
            action: "magic_code_confirmed",
            userId: resolved.user.id,
            email,
          },
          authTimestamp
        );
        saveDb();
        return json(res, 200, safeUser(resolved.user));
      }

      if (path === "/api/auth/password/status" && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const credential = ensureAuthCredential(db, actorUser.id);
        const nowMs = nowTs();
        const locked =
          credential.state === "locked_temp" &&
          isAuthCredentialLocked(credential, nowMs);
        if (credential.state === "locked_temp" && !locked) {
          clearAuthCredentialLock(credential, nowIso());
          saveDb();
        }
        return json(res, 200, {
          ok: true,
          hasPassword: Boolean(credential.passwordHash),
          lockedUntil: locked ? credential.lockedUntil ?? null : null,
          state: locked ? "locked_temp" : credential.state,
          lastPasswordChangeAt: credential.lastPasswordChangeAt ?? null,
        });
      }

      if (path === "/api/auth/password/login" && method === "POST") {
        const body = (await readBody(req)) as { email?: string; password?: string };
        const email = canonicalizeTeacherLoginEmail(normalizeEmail(body?.email));
        const password = normalizePasswordInput(body?.password);
        if (!email || !password) {
          return json(res, 400, { error: "Введите email и пароль." });
        }

        const user = db.users.find((item) => normalizeEmail(item.email) === email) ?? null;
        const timestamp = nowIso();
        const genericError = "Неверный email или пароль.";
        if (!user) {
          registerAuthAudit(
            db,
            {
              action: "password_login_failed",
              email,
              metadata: { reason: "user_not_found" },
            },
            timestamp
          );
          saveDb();
          return json(res, 401, { error: genericError });
        }

        const credential = ensureAuthCredential(db, user.id, timestamp);
        if (!credential.passwordHash) {
          return json(res, 409, {
            error:
              "Для этого аккаунта пароль пока не задан. Войдите по ссылке из email и задайте пароль в профиле.",
            code: "password_not_set",
          });
        }

        if (isAuthCredentialLocked(credential, nowTs())) {
          registerAuthAudit(
            db,
            {
              action: "password_login_locked",
              userId: user.id,
              email,
              metadata: { lockedUntil: credential.lockedUntil },
            },
            timestamp
          );
          saveDb();
          return json(res, 429, {
            error:
              "Слишком много неудачных попыток. Повторите вход позже.",
            code: "password_locked",
            lockedUntil: credential.lockedUntil ?? null,
          });
        }

        if (!verifyPasswordHash(password, credential.passwordHash)) {
          markAuthCredentialFailedAttempt(credential, timestamp);
          registerAuthAudit(
            db,
            {
              action:
                credential.state === "locked_temp"
                  ? "password_login_locked"
                  : "password_login_failed",
              userId: user.id,
              email,
              metadata: {
                failedAttempts:
                  credential.state === "locked_temp"
                    ? AUTH_PASSWORD_MAX_FAILED_ATTEMPTS
                    : credential.failedAttempts,
                lockedUntil: credential.lockedUntil,
              },
            },
            timestamp
          );
          saveDb();
          if (credential.state === "locked_temp") {
            return json(res, 429, {
              error:
                "Слишком много неудачных попыток. Повторите вход позже.",
              code: "password_locked",
              lockedUntil: credential.lockedUntil ?? null,
            });
          }
          return json(res, 401, { error: genericError });
        }

        clearAuthCredentialLock(credential, timestamp);
        const isTeacher = teacherEmailSet.has(email);
        if (isTeacher && user.role !== "teacher") {
          return json(res, 403, {
            error: "Доступ преподавателя недоступен для этого аккаунта.",
          });
        }
        if (user.role === "student" && !isTeacher) {
          const hasPurchase = db.purchases.some((p) => p.userId === user.id);
          const hasBooking = db.bookings.some((b) => b.studentId === user.id);
          const hasCheckout = db.checkoutProcesses.some((checkout) => {
            const sameUser = checkout.userId === user.id;
            const sameEmail =
              normalizeEmail(checkout.email) === normalizeEmail(user.email);
            if (!sameUser && !sameEmail) return false;
            return (
              checkout.state === "created" ||
              checkout.state === "awaiting_payment" ||
              isPositiveCheckoutState(checkout.state)
            );
          });
          if (!hasPurchase && !hasBooking && !hasCheckout) {
            return json(res, 403, {
              error:
                "У вас пока нет покупок и записей на занятия. Сначала оформите курс или запись.",
            });
          }
        }

        if (isIdentityVerified(db, { userId: user.id, email: user.email })) {
          activatePendingEntitlements(db, user.id, timestamp);
          ensureUserCourseArtifacts(
            db,
            {
              userId: user.id,
              email: user.email,
            },
            timestamp
          );
        }
        registerAuthAudit(
          db,
          {
            action: "password_login_succeeded",
            userId: user.id,
            email: user.email,
          },
          timestamp
        );
        const session = createAuthSession(
          db,
          {
            userId: user.id,
            email: user.email,
            role: user.role,
          },
          timestamp
        );
        setSessionCookie(res, session.id);
        saveDb();
        return json(res, 200, safeUser(user));
      }

      if (path === "/api/auth/password/set" && method === "POST") {
        if (!actorUser || !actorSession) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as {
          currentPassword?: string;
          newPassword?: string;
        };
        const currentPassword = normalizePasswordInput(body?.currentPassword);
        const newPassword = normalizePasswordInput(body?.newPassword);
        if (!newPassword) {
          return json(res, 400, { error: "Введите новый пароль." });
        }
        const policyError = validatePasswordPolicy(newPassword);
        if (policyError) {
          return json(res, 409, { error: policyError, code: "password_policy_error" });
        }
        const timestamp = nowIso();
        const credential = ensureAuthCredential(db, actorUser.id, timestamp);
        const hadPassword = Boolean(credential.passwordHash);
        if (credential.passwordHash) {
          if (!currentPassword) {
            return json(res, 409, {
              error: "Введите текущий пароль.",
              code: "current_password_required",
            });
          }
          if (!verifyPasswordHash(currentPassword, credential.passwordHash)) {
            return json(res, 409, {
              error: "Текущий пароль указан неверно.",
              code: "current_password_invalid",
            });
          }
        }
        setAuthCredentialPassword(credential, newPassword, timestamp);
        db.authSessions.forEach((record) => {
          if (
            record.userId === actorUser.id &&
            record.id !== actorSession.id &&
            record.state === "active"
          ) {
            record.state = "revoked";
            record.updatedAt = timestamp;
          }
        });
        registerAuthAudit(
          db,
          {
            action: hadPassword ? "password_changed" : "password_set",
            userId: actorUser.id,
            email: actorUser.email,
          },
          timestamp
        );
        saveDb();
        return json(res, 200, {
          ok: true,
          message: "Пароль сохранен. Другие сессии автоматически завершены.",
        });
      }

      if (path === "/api/auth/password/change" && method === "POST") {
        if (!actorUser || !actorSession) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as {
          currentPassword?: string;
          newPassword?: string;
        };
        const currentPassword = normalizePasswordInput(body?.currentPassword);
        const newPassword = normalizePasswordInput(body?.newPassword);
        if (!currentPassword || !newPassword) {
          return json(res, 400, { error: "Введите текущий и новый пароль." });
        }
        const policyError = validatePasswordPolicy(newPassword);
        if (policyError) {
          return json(res, 409, { error: policyError, code: "password_policy_error" });
        }
        const timestamp = nowIso();
        const credential = ensureAuthCredential(db, actorUser.id, timestamp);
        if (!credential.passwordHash) {
          return json(res, 409, {
            error: "Для аккаунта пока не задан пароль.",
            code: "password_not_set",
          });
        }
        if (!verifyPasswordHash(currentPassword, credential.passwordHash)) {
          return json(res, 409, {
            error: "Текущий пароль указан неверно.",
            code: "current_password_invalid",
          });
        }
        setAuthCredentialPassword(credential, newPassword, timestamp);
        db.authSessions.forEach((record) => {
          if (
            record.userId === actorUser.id &&
            record.id !== actorSession.id &&
            record.state === "active"
          ) {
            record.state = "revoked";
            record.updatedAt = timestamp;
          }
        });
        registerAuthAudit(
          db,
          {
            action: "password_changed",
            userId: actorUser.id,
            email: actorUser.email,
          },
          timestamp
        );
        saveDb();
        return json(res, 200, {
          ok: true,
          message: "Пароль обновлен. Другие сессии автоматически завершены.",
        });
      }

      if (path === "/api/auth/password/reset/request" && method === "POST") {
        const body = (await readBody(req)) as { email?: string };
        const email = canonicalizeTeacherLoginEmail(normalizeEmail(body?.email));
        if (!email) {
          return json(res, 400, { error: "Введите email." });
        }
        const timestamp = nowIso();
        const genericMessage =
          "Если аккаунт существует, мы отправили инструкцию по сбросу пароля.";
        const user = db.users.find((item) => normalizeEmail(item.email) === email) ?? null;
        if (!user) {
          registerAuthAudit(
            db,
            {
              action: "password_reset_requested",
              email,
              metadata: { userFound: false },
            },
            timestamp
          );
          saveDb();
          return json(res, 200, { ok: true, message: genericMessage });
        }
        const credential = ensureAuthCredential(db, user.id, timestamp);
        credential.state = "reset_pending";
        credential.updatedAt = timestamp;
        const issued = issuePasswordResetToken(
          db,
          { userId: user.id, email: user.email },
          timestamp
        );
        if (issued) {
          enqueueOutboxEmail(
            db,
            {
              template: "password_reset",
              dedupeKey: `password_reset:${email}:${getDedupeMinuteWindow(timestamp)}`,
              recipientEmail: email,
              userId: user.id,
              resetToken: issued.rawToken,
            },
            timestamp
          );
        }
        await dispatchOutboxQueue(db, timestamp);
        registerAuthAudit(
          db,
          {
            action: "password_reset_requested",
            userId: user.id,
            email,
            metadata: { userFound: true },
          },
          timestamp
        );
        saveDb();
        return json(res, 200, {
          ok: true,
          message: genericMessage,
          debugToken: AUTH_DEBUG_TOKENS ? issued?.rawToken ?? null : null,
        });
      }

      if (path === "/api/auth/password/reset/confirm" && method === "POST") {
        const body = (await readBody(req)) as {
          email?: string;
          token?: string;
          newPassword?: string;
        };
        const email = canonicalizeTeacherLoginEmail(normalizeEmail(body?.email));
        const token = typeof body?.token === "string" ? body.token.trim() : "";
        const newPassword = normalizePasswordInput(body?.newPassword);
        if (!email || !token || !newPassword) {
          return json(res, 400, {
            error: "Введите email, код подтверждения и новый пароль.",
          });
        }
        const policyError = validatePasswordPolicy(newPassword);
        if (policyError) {
          return json(res, 409, { error: policyError, code: "password_policy_error" });
        }
        const timestamp = nowIso();
        const consumed = consumePasswordResetToken(
          db,
          {
            email,
            token,
          },
          timestamp
        );
        if (!consumed) {
          return json(res, 409, {
            error:
              "Ссылка или код сброса недействительны. Запросите сброс пароля повторно.",
            code: "password_reset_token_invalid",
          });
        }
        const user = db.users.find((item) => item.id === consumed.userId) ?? null;
        if (!user) {
          return json(res, 404, { error: "Пользователь не найден." });
        }
        const credential = ensureAuthCredential(db, user.id, timestamp);
        setAuthCredentialPassword(credential, newPassword, timestamp);
        db.authSessions.forEach((record) => {
          if (record.userId !== user.id) return;
          if (record.state !== "active") return;
          record.state = "revoked";
          record.updatedAt = timestamp;
        });
        registerAuthAudit(
          db,
          {
            action: "password_reset_completed",
            userId: user.id,
            email: user.email,
          },
          timestamp
        );
        saveDb();
        clearSessionCookie(res);
        return json(res, 200, {
          ok: true,
          message: "Пароль успешно обновлен. Войдите заново.",
        });
      }

      if (path === "/api/auth/verification/resend" && method === "POST") {
        const body = (await readBody(req)) as { email: string };
        const email = canonicalizeTeacherLoginEmail(normalizeEmail(body?.email));
        if (!email) {
          return json(res, 400, { error: "Email обязателен" });
        }
        const user = db.users.find((item) => normalizeEmail(item.email) === email) ?? null;
        const identity = getIdentityRecord(db, { email });
        if (!user && !identity) {
          return json(res, 404, { error: "Пользователь не найден." });
        }
        const timestamp = nowIso();
        if (identity?.state === "verified") {
          return json(res, 200, {
            ok: true,
            status: "already_verified",
            message: "Email уже подтвержден.",
          });
        }
        captureConsent(
          db,
          {
            email,
            userId: user?.id,
            scope: "auth",
          },
          timestamp
        );
        enqueueOutboxEmail(
          db,
          {
            template: "verification_resend",
            dedupeKey: `verification_resend:${email}:${getDedupeMinuteWindow(timestamp)}`,
            recipientEmail: email,
            userId: user?.id,
            recommendation: "verify_email",
          },
          timestamp
        );
        await dispatchOutboxQueue(db, timestamp);
        saveDb();
        return json(res, 200, {
          ok: true,
          status: "sent",
          message: "Ссылка подтверждения отправлена повторно.",
        });
      }

      if (path === "/api/auth/verification/change-email" && method === "POST") {
        const body = (await readBody(req)) as {
          email: string;
          newEmail: string;
        };
        const email = canonicalizeTeacherLoginEmail(normalizeEmail(body?.email));
        const newEmail = canonicalizeTeacherLoginEmail(
          normalizeEmail(body?.newEmail)
        );
        if (!email || !newEmail) {
          return json(res, 400, { error: "Требуются текущий и новый email." });
        }
        if (newEmail === email) {
          return json(res, 400, { error: "Новый email должен отличаться от текущего." });
        }
        if (teacherEmailSet.has(newEmail)) {
          return json(res, 400, {
            error:
              "Этот email зарезервирован для преподавателя. Используйте email ученика.",
          });
        }
        const user = db.users.find((item) => normalizeEmail(item.email) === email) ?? null;
        if (!user) {
          return json(res, 404, { error: "Пользователь не найден." });
        }
        if (user.role === "teacher") {
          return json(res, 400, {
            error: "Email преподавателя нельзя изменять через этот сценарий.",
          });
        }
        if (isIdentityVerified(db, { userId: user.id, email })) {
          return json(res, 409, {
            error:
              "Email уже подтвержден. Используйте стандартное редактирование профиля.",
          });
        }
        const userWithNewEmail = db.users.find(
          (item) => normalizeEmail(item.email) === newEmail
        );
        if (userWithNewEmail) {
          return json(res, 409, {
            error:
              "Аккаунт с таким email уже существует. Авторизуйтесь в существующем аккаунте.",
          });
        }
        const identityWithNewEmail = getIdentityRecord(db, { email: newEmail });
        if (identityWithNewEmail) {
          return json(res, 409, {
            error: "Этот email уже используется в процессе подтверждения.",
          });
        }

        const timestamp = nowIso();
        user.email = newEmail;
        let hasIdentityForUser = false;
        db.identity = db.identity
          .filter(
            (record) =>
              normalizeEmail(record.email) !== email || record.userId === user.id
          )
          .map((record) => {
            const belongsToUser = record.userId === user.id;
            const belongsToOldEmail = normalizeEmail(record.email) === email;
            if (!belongsToUser && !belongsToOldEmail) return record;
            hasIdentityForUser = true;
            return {
              ...record,
              email: newEmail,
              userId: user.id,
              state: "known_unverified",
              updatedAt: timestamp,
            };
          });
        if (!hasIdentityForUser) {
          db.identity.push({
            email: newEmail,
            userId: user.id,
            state: "known_unverified",
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }

        db.checkoutProcesses.forEach((checkout) => {
          if (checkout.userId === user.id || normalizeEmail(checkout.email) === email) {
            checkout.email = newEmail;
            checkout.updatedAt = timestamp;
          }
        });
        db.bookings.forEach((booking) => {
          if (booking.studentId === user.id || normalizeEmail(booking.studentEmail) === email) {
            booking.studentEmail = newEmail;
          }
        });
        db.consents.forEach((record) => {
          if (record.userId === user.id || normalizeEmail(record.email) === email) {
            record.email = newEmail;
            record.userId = user.id;
          }
        });
        saveDb();
        return json(res, 200, {
          ok: true,
          user: safeUser(user),
          message:
            "Email обновлен. Подтвердите новый адрес через вход по magic-link.",
        });
      }

      if (path === "/api/auth/recover-access" && method === "POST") {
        const body = (await readBody(req)) as { email: string };
        const email = canonicalizeTeacherLoginEmail(normalizeEmail(body?.email));
        if (!email) {
          return json(res, 400, { error: "Email обязателен" });
        }
        const user = db.users.find((item) => normalizeEmail(item.email) === email) ?? null;
        if (!user) {
          const checkoutsByEmail = db.checkoutProcesses.filter(
            (checkout) => normalizeEmail(checkout.email) === email
          );
          const paidCheckoutsByEmail = checkoutsByEmail.filter((checkout) =>
            isPositiveCheckoutState(checkout.state)
          );
          const recommendation:
            | "complete_profile"
            | "verify_email"
            | "login"
            | "restore_access"
            | "no_access_records" =
            paidCheckoutsByEmail.length > 0 ? "login" : "no_access_records";
          const recoveryTimestamp = nowIso();
          enqueueOutboxEmail(
            db,
            {
              template: "access_recovery",
              dedupeKey: `access_recovery:${email}:${recommendation}:${getDedupeMinuteWindow(
                recoveryTimestamp
              )}`,
              recipientEmail: email,
              recommendation,
            },
            recoveryTimestamp
          );
          await dispatchOutboxQueue(db, recoveryTimestamp);
          saveDb();
          return json(res, 200, {
            ok: true,
            email,
            user: null,
            verified: false,
            identityState: "known_unverified",
            checkoutCount: checkoutsByEmail.length,
            paidCheckoutCount: paidCheckoutsByEmail.length,
            purchaseCount: 0,
            hasAnyActiveCourseEntitlement: false,
            pendingEntitlements: 0,
            recommendation,
          });
        }
        const identity = getIdentityRecord(db, { email, userId: user.id });
        const verified = identity?.state === "verified";
        if (verified) {
          const timestamp = nowIso();
          activatePendingEntitlements(db, user.id, timestamp);
          const repaired = ensureUserCourseArtifacts(
            db,
            {
              userId: user.id,
              email: user.email,
            },
            timestamp
          );
          if (repaired) {
            saveDb();
          }
        }
        const userCheckouts = db.checkoutProcesses.filter(
          (checkout) =>
            checkout.userId === user.id || normalizeEmail(checkout.email) === email
        );
        const paidCheckouts = userCheckouts.filter(
          (checkout) =>
            checkout.state === "paid" ||
            checkout.state === "provisioning" ||
            checkout.state === "provisioned"
        );
        const userPurchases = db.purchases.filter((purchase) => purchase.userId === user.id);
        const profileComplete = Boolean(
          user.firstName?.trim() &&
            user.lastName?.trim() &&
            normalizePhoneStorage(user.phone)
        );
        const hasAnyActiveCourseEntitlement = db.entitlements.some(
          (record) =>
            record.userId === user.id &&
            record.kind === "course_access" &&
            record.state === "active"
        );
        const pendingEntitlements = db.entitlements.filter(
          (record) => record.userId === user.id && record.state === "pending_activation"
        ).length;
        let recommendation:
          | "complete_profile"
          | "verify_email"
          | "login"
          | "restore_access"
          | "no_access_records" = "no_access_records";
        if (paidCheckouts.length > 0 && !profileComplete) {
          recommendation = "complete_profile";
        } else if (!verified) {
          recommendation = "verify_email";
        } else if (paidCheckouts.length > 0 && !hasAnyActiveCourseEntitlement) {
          recommendation = "restore_access";
        } else if (userPurchases.length > 0 || hasAnyActiveCourseEntitlement) {
          recommendation = "login";
        }
        const recoveryTimestamp = nowIso();
        enqueueOutboxEmail(
          db,
          {
            template: "access_recovery",
            dedupeKey: `access_recovery:${email}:${recommendation}:${getDedupeMinuteWindow(
              recoveryTimestamp
            )}`,
            recipientEmail: email,
            userId: user.id,
            recommendation,
          },
          recoveryTimestamp
        );
        await dispatchOutboxQueue(db, recoveryTimestamp);
        saveDb();
        return json(res, 200, {
          ok: true,
          email,
          user: safeUser(user),
          verified,
          identityState: identity?.state ?? "anonymous",
          checkoutCount: userCheckouts.length,
          paidCheckoutCount: paidCheckouts.length,
          purchaseCount: userPurchases.length,
          hasAnyActiveCourseEntitlement,
          pendingEntitlements,
          recommendation,
        });
      }

      if (path === "/api/users" && method === "GET") {
        const role = url.searchParams.get("role");
        if (role === "teacher") {
          const users = db.users.filter((u) => u.role === role);
          return json(res, 200, users.map((u) => safeUser(u)));
        }
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const users =
          actorUser.role === "teacher"
            ? role
              ? db.users.filter((u) => u.role === role)
              : db.users
            : db.users.filter((u) => u.id === actorUser.id);
        return json(res, 200, users.map((u) => safeUser(u)));
      }

      const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch && method === "PUT") {
        const userId = decodeURIComponent(userMatch[1]);
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        if (actorUser.id !== userId) {
          return json(res, 403, {
            error: "Изменять можно только собственный профиль.",
          });
        }
        const body = (await readBody(req)) as Partial<{
          firstName: string;
          lastName: string;
          phone: string;
          photo: string;
        }>;
        const userIndex = db.users.findIndex((u) => u.id === userId);
        if (userIndex === -1) {
          return json(res, 404, { error: "User not found" });
        }
        const existing = db.users[userIndex];
        const nextPhone =
          body.phone !== undefined
            ? normalizePhoneStorage(body.phone)
            : existing.phone;
        db.users[userIndex] = {
          ...existing,
          firstName: body.firstName ?? existing.firstName,
          lastName: body.lastName ?? existing.lastName,
          phone: nextPhone,
          photo: body.photo ?? existing.photo,
        };
        saveDb();
        return json(res, 200, safeUser(db.users[userIndex]));
      }

      // ================= ASSISTANT =================
      if (path === "/api/assistant/session" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as AssistantSessionCreateRequest;
        if (!body?.userId || body.userId !== actorUser.id) {
          return json(res, 403, { error: "Неверный пользователь сессии ассистента." });
        }
        if (body.role !== actorUser.role) {
          return json(res, 403, { error: "Роль сессии не совпадает с авторизацией." });
        }
        const payload = createAssistantSessionBundle(db, body);
        saveDb();
        return json(res, 200, payload);
      }

      const assistantSessionMatch = path.match(/^\/api\/assistant\/session\/([^/]+)$/);
      if (assistantSessionMatch && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(assistantSessionMatch[1]);
        const payload = getAssistantSessionBundle(db, sessionId);
        if (!payload) {
          return json(res, 404, { error: "Сессия ассистента не найдена." });
        }
        if (payload.session.userId !== actorUser.id) {
          return json(res, 403, { error: "Нет доступа к этой сессии ассистента." });
        }
        return json(res, 200, payload);
      }

      if (path === "/api/assistant/respond" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as AssistantRespondRequest;
        if (!body?.userId || body.userId !== actorUser.id) {
          return json(res, 403, { error: "Неверный пользователь запроса ассистента." });
        }
        if (body.role !== actorUser.role) {
          return json(res, 403, { error: "Роль ассистента не совпадает с ролью аккаунта." });
        }
        const payload = await respondWithAssistant(db, body);
        saveDb();
        return json(res, 200, payload);
      }

      const teacherInsightsMatch = path.match(/^\/api\/teacher\/insights\/([^/]+)$/);
      if (teacherInsightsMatch && method === "GET") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, { error: "Инсайты доступны только преподавателю." });
        }
        const teacherId = decodeURIComponent(teacherInsightsMatch[1]);
        if (teacherId !== actorUser.id) {
          return json(res, 403, { error: "Доступны только собственные инсайты." });
        }
        const payload = getTeacherInsightsPayload(db, teacherId);
        return json(res, 200, payload);
      }

      const studentRecommendationsMatch = path.match(
        /^\/api\/student\/recommendations\/([^/]+)$/
      );
      if (studentRecommendationsMatch && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const studentId = decodeURIComponent(studentRecommendationsMatch[1]);
        if (studentId !== actorUser.id && actorUser.role !== "teacher") {
          return json(res, 403, { error: "Нет доступа к рекомендациям студента." });
        }
        const payload = getStudentRecommendationPayload(db, studentId);
        return json(res, 200, payload);
      }

      if (path === "/api/authoring/course-outline" && method === "POST") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, { error: "Доступно только преподавателю." });
        }
        const body = (await readBody(req)) as AuthoringCourseOutlineRequest;
        if (!body?.teacherId || body.teacherId !== actorUser.id) {
          return json(res, 403, { error: "Неверный преподаватель в запросе." });
        }
        const payload = buildCourseOutlinePayload(body);
        return json(res, 200, payload);
      }

      if (path === "/api/authoring/lesson-draft" && method === "POST") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, { error: "Доступно только преподавателю." });
        }
        const body = (await readBody(req)) as AuthoringLessonDraftRequest;
        if (!body?.teacherId || body.teacherId !== actorUser.id) {
          return json(res, 403, { error: "Неверный преподаватель в запросе." });
        }
        const payload = buildLessonDraftPayload(body);
        return json(res, 200, payload);
      }

      if (path === "/api/assistant/events" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as AssistantPlatformEventRequest;
        if (!body?.userId || body.userId !== actorUser.id) {
          return json(res, 403, { error: "Неверный пользователь события." });
        }
        const payload = trackAssistantEvent(db, body);
        saveDb();
        return json(res, 200, payload);
      }

      // ================= WORKBOOK =================
      if (path === "/api/workbook/pdf/render" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as {
          fileName?: unknown;
          dataUrl?: unknown;
          dpi?: unknown;
          maxPages?: unknown;
        };
        const pdfBuffer = decodePdfDataUrl(body?.dataUrl);
        if (!pdfBuffer) {
          return json(res, 400, { error: "Некорректный PDF payload." });
        }
        if (pdfBuffer.length > WORKBOOK_PDF_RENDER_MAX_BYTES) {
          return json(res, 413, { error: "Файл слишком большой для рендера." });
        }
        const dpi =
          typeof body?.dpi === "number" && Number.isFinite(body.dpi)
            ? Math.max(72, Math.min(220, Math.floor(body.dpi)))
            : 144;
        const maxPages =
          typeof body?.maxPages === "number" && Number.isFinite(body.maxPages)
            ? Math.max(1, Math.min(WORKBOOK_PDF_RENDER_MAX_PAGES, Math.floor(body.maxPages)))
            : 10;
        try {
          const pages = await renderPdfPagesViaPoppler({
            pdfBuffer,
            dpi,
            maxPages,
          });
          return json(res, 200, {
            renderer: "poppler",
            fileName: typeof body?.fileName === "string" ? body.fileName : "document.pdf",
            pages,
          });
        } catch (error) {
          return json(res, 503, {
            error:
              "PDF render backend недоступен. Установите poppler (pdftoppm) или используйте image-файл.",
            renderer: "unavailable",
            details: error instanceof Error ? error.message : "unknown",
          });
        }
      }

      if (path === "/api/workbook/ink/recognize" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as {
          sessionId?: unknown;
          strokes?: unknown;
          preferMath?: unknown;
        };
        const sessionId =
          typeof body.sessionId === "string" ? body.sessionId.trim() : "";
        if (!sessionId) {
          return json(res, 400, { error: "sessionId обязателен." });
        }
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) {
          return json(res, 404, { error: "Сессия не найдена." });
        }
        if (!canActorAccessWorkbookSession(db, sessionId, actorUser.id)) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        return json(res, 200, {
          provider: "mock",
          supported: false,
          result: null,
        });
      }

      if (path === "/api/workbook/drafts" && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const scope = url.searchParams.get("scope");
        const drafts = db.workbookDrafts
          .filter((draft) => draft.ownerUserId === actorUser.id)
          .map((draft) =>
            serializeWorkbookDraftCard(db, draft, {
              id: actorUser.id,
              role: actorUser.role,
            })
          )
          .filter(
            (draft): draft is NonNullable<ReturnType<typeof serializeWorkbookDraftCard>> =>
              Boolean(draft)
          )
          .filter((draft) => {
            if (scope === "personal") return draft.kind === "PERSONAL";
            if (scope === "class") return draft.kind === "CLASS";
            return true;
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return json(res, 200, { items: drafts });
      }

      if (path === "/api/workbook/sessions" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as { kind?: string; title?: string };
        const kind = body?.kind === "CLASS" ? "CLASS" : "PERSONAL";
        if (kind === "CLASS" && actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Коллективную сессию может создать только преподаватель.",
          });
        }
        const timestamp = nowIso();
        const title = sanitizeWorkbookTitle(kind, body?.title, toDisplayName(actorUser));
        const session: WorkbookSessionRecord = {
          id: ensureId(),
          kind,
          createdBy: actorUser.id,
          status: "in_progress",
          title,
          createdAt: timestamp,
          startedAt: timestamp,
          endedAt: null,
          lastActivityAt: timestamp,
          context: safeStringify({ settings: defaultWorkbookSettings() }),
        };
        db.workbookSessions.push(session);
        db.workbookParticipants.push({
          sessionId: session.id,
          userId: actorUser.id,
          roleInSession: actorUser.role,
          permissions: stringifyWorkbookPermissions(
            defaultWorkbookPermissions(actorUser.role, kind)
          ),
          joinedAt: timestamp,
          leftAt: null,
          isActive: true,
          lastSeenAt: timestamp,
        });
        const draft = ensureWorkbookDraft(db, {
          ownerUserId: actorUser.id,
          session,
          statusForCard: "in_progress",
          timestamp,
        });
        saveDb();
        return json(res, 200, {
          session: serializeWorkbookSession(db, session, {
            id: actorUser.id,
            role: actorUser.role,
          }),
          draft: serializeWorkbookDraftCard(
            db,
            draft,
            { id: actorUser.id, role: actorUser.role }
          ),
        });
      }

      const workbookSessionMatch = path.match(/^\/api\/workbook\/sessions\/([^/]+)$/);
      if (workbookSessionMatch && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookSessionMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) {
          return json(res, 404, { error: "Сессия не найдена." });
        }
        if (!canActorAccessWorkbookSession(db, sessionId, actorUser.id)) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        return json(
          res,
          200,
          serializeWorkbookSession(db, session, {
            id: actorUser.id,
            role: actorUser.role,
          })
        );
      }

      if (workbookSessionMatch && method === "PUT") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookSessionMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) {
          return json(res, 404, { error: "Сессия не найдена." });
        }
        const participant = getWorkbookParticipant(db, sessionId, actorUser.id);
        if (!participant) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        const permissions = parseWorkbookPermissions(
          participant.permissions,
          actorUser.role,
          session.kind
        );
        const isOwner = session.createdBy === actorUser.id;
        const canRenamePersonal = session.kind === "PERSONAL" && isOwner;
        const canRenameClass =
          session.kind === "CLASS" &&
          actorUser.role === "teacher" &&
          isOwner &&
          permissions.canManageSession;
        if (!canRenamePersonal && !canRenameClass) {
          return json(res, 403, { error: "Недостаточно прав для переименования сессии." });
        }
        const body = (await readBody(req)) as { title?: unknown };
        const rawTitle = typeof body.title === "string" ? body.title : "";
        const nextTitle = sanitizeWorkbookTitle(
          session.kind,
          rawTitle,
          toDisplayName(actorUser)
        );
        session.title = nextTitle;
        const timestamp = nowIso();
        touchWorkbookSessionActivity(session, timestamp);
        db.workbookDrafts = db.workbookDrafts.map((draft) =>
          draft.sessionId === sessionId
            ? {
                ...draft,
                title: nextTitle,
                updatedAt: timestamp,
              }
            : draft
        );
        appendWorkbookEvent(db, {
          sessionId,
          authorUserId: actorUser.id,
          type: "board.settings.update",
          payload: {
            boardSettings: {
              title: nextTitle,
            },
          },
          createdAt: timestamp,
        });
        saveDb();
        return json(res, 200, {
          ok: true,
          session: serializeWorkbookSession(db, session, {
            id: actorUser.id,
            role: actorUser.role,
          }),
        });
      }

      if (workbookSessionMatch && method === "DELETE") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookSessionMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) {
          return json(res, 404, { error: "Сессия не найдена." });
        }
        const participant = getWorkbookParticipant(db, sessionId, actorUser.id);
        if (!participant) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        const permissions = parseWorkbookPermissions(
          participant.permissions,
          actorUser.role,
          session.kind
        );
        const isOwner = session.createdBy === actorUser.id;
        const canDeleteClass =
          session.kind === "CLASS" &&
          actorUser.role === "teacher" &&
          isOwner &&
          permissions.canManageSession;
        const canDeletePersonal = session.kind === "PERSONAL" && isOwner;
        const canRemoveOwnClassCard = session.kind === "CLASS" && !canDeleteClass;
        if (!canDeleteClass && !canDeletePersonal && !canRemoveOwnClassCard) {
          return json(res, 403, {
            error:
              "Удалить сессию может только учитель-владелец (для CLASS) или владелец личной тетради.",
          });
        }

        if (canRemoveOwnClassCard) {
          db.workbookDrafts = db.workbookDrafts.filter(
            (item) => !(item.sessionId === sessionId && item.ownerUserId === actorUser.id)
          );
          db.workbookParticipants = db.workbookParticipants.filter(
            (item) => !(item.sessionId === sessionId && item.userId === actorUser.id)
          );
          closeWorkbookStreamClientByUser(sessionId, actorUser.id);
          saveDb();
          return json(res, 200, {
            ok: true,
            deletedSessionId: sessionId,
            message: "Карточка коллективного урока удалена из вашего списка.",
          });
        }

        const affectedDraftOwners = new Set(
          db.workbookDrafts
            .filter((draft) => draft.sessionId === sessionId)
            .map((draft) => draft.ownerUserId)
        );
        db.workbookParticipants = db.workbookParticipants.filter(
          (item) => item.sessionId !== sessionId
        );
        db.workbookDrafts = db.workbookDrafts.filter(
          (item) => item.sessionId !== sessionId
        );
        db.workbookInvites = db.workbookInvites.filter(
          (item) => item.sessionId !== sessionId
        );
        db.workbookEvents = db.workbookEvents.filter(
          (item) => item.sessionId !== sessionId
        );
        db.workbookSnapshots = db.workbookSnapshots.filter(
          (item) => item.sessionId !== sessionId
        );
        db.workbookSessions = db.workbookSessions.filter(
          (item) => item.id !== sessionId
        );
        closeWorkbookStreamSession(sessionId);
        saveDb();
        return json(res, 200, {
          ok: true,
          deletedSessionId: sessionId,
          message:
            session.kind === "CLASS"
              ? `Коллективный урок удален у ${Math.max(1, affectedDraftOwners.size)} участников.`
              : "Личная тетрадь удалена.",
        });
      }

      const workbookOpenMatch = path.match(
        /^\/api\/workbook\/sessions\/([^/]+)\/open$/
      );
      if (workbookOpenMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookOpenMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) {
          return json(res, 404, { error: "Сессия не найдена." });
        }
        const participant = getWorkbookParticipant(db, sessionId, actorUser.id);
        if (!participant) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        const timestamp = nowIso();
        participant.isActive = true;
        participant.leftAt = null;
        participant.lastSeenAt = timestamp;
        touchWorkbookSessionActivity(session, timestamp);
        ensureWorkbookDraft(db, {
          ownerUserId: actorUser.id,
          session,
          statusForCard: session.status === "ended" ? "ended" : "in_progress",
          timestamp,
        });
        saveDb();
        return json(res, 200, { ok: true });
      }

      const workbookEndMatch = path.match(/^\/api\/workbook\/sessions\/([^/]+)\/end$/);
      if (workbookEndMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookEndMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) {
          return json(res, 404, { error: "Сессия не найдена." });
        }
        const participant = getWorkbookParticipant(db, sessionId, actorUser.id);
        if (!participant) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        const permissions = parseWorkbookPermissions(
          participant.permissions,
          actorUser.role,
          session.kind
        );
        if (!permissions.canManageSession && session.createdBy !== actorUser.id) {
          return json(res, 403, { error: "Завершение доступно только преподавателю." });
        }
        if (session.status === "ended") {
          return json(res, 200, {
            ok: true,
            session: serializeWorkbookSession(db, session, {
              id: actorUser.id,
              role: actorUser.role,
            }),
          });
        }
        const timestamp = nowIso();
        const studentParticipants = db.workbookParticipants.filter(
          (item) => item.sessionId === sessionId && item.roleInSession === "student"
        );
        session.status = "ended";
        session.endedAt = timestamp;
        session.lastActivityAt = timestamp;
        db.workbookParticipants = db.workbookParticipants.map((item) =>
          item.sessionId === sessionId
            ? {
                ...item,
                isActive: false,
                leftAt: timestamp,
                lastSeenAt: timestamp,
              }
            : item
        );
        db.workbookDrafts = db.workbookDrafts.map((draft) =>
          draft.sessionId === sessionId
            ? {
                ...draft,
                statusForCard: "ended",
                updatedAt: timestamp,
                redirectSessionId: draft.redirectSessionId ?? null,
              }
            : draft
        );
        db.workbookSnapshots = db.workbookSnapshots.map((snapshot) =>
          snapshot.sessionId === sessionId && snapshot.layer === "board"
            ? {
                ...snapshot,
                payload: stripWorkbookChatFromScenePayload(snapshot.payload),
                createdAt: timestamp,
              }
            : snapshot
        );
        db.workbookEvents = db.workbookEvents.filter(
          (event) => !(event.sessionId === sessionId && event.type === "chat.message")
        );
        studentParticipants.forEach((studentParticipant) => {
          const personalSession: WorkbookSessionRecord = {
            id: ensureId(),
            kind: "PERSONAL",
            createdBy: studentParticipant.userId,
            status: "in_progress",
            title: `${session.title} (личная тетрадь)`,
            createdAt: timestamp,
            startedAt: timestamp,
            endedAt: null,
            lastActivityAt: timestamp,
            context: session.context ?? null,
          };
          db.workbookSessions.push(personalSession);
          db.workbookParticipants.push({
            sessionId: personalSession.id,
            userId: studentParticipant.userId,
            roleInSession: "student",
            permissions: stringifyWorkbookPermissions(
              defaultWorkbookPermissions("student", "PERSONAL")
            ),
            joinedAt: timestamp,
            leftAt: null,
            isActive: true,
            lastSeenAt: timestamp,
          });
          const sourceSnapshots = db.workbookSnapshots.filter(
            (snapshot) => snapshot.sessionId === sessionId
          );
          sourceSnapshots.forEach((snapshot) => {
            db.workbookSnapshots.push({
              id: ensureId(),
              sessionId: personalSession.id,
              layer: snapshot.layer,
              version: snapshot.version,
              payload:
                snapshot.layer === "board"
                  ? stripWorkbookChatFromScenePayload(snapshot.payload)
                  : snapshot.payload,
              createdAt: timestamp,
            });
          });
          const personalDraft = ensureWorkbookDraft(db, {
            ownerUserId: studentParticipant.userId,
            session: personalSession,
            statusForCard: "in_progress",
            timestamp,
          });
          db.workbookDrafts = db.workbookDrafts.map((draft) =>
            draft.sessionId === sessionId &&
            draft.ownerUserId === studentParticipant.userId
              ? {
                  ...draft,
                  statusForCard: "ended",
                  updatedAt: timestamp,
                  redirectSessionId: personalDraft.sessionId,
                }
              : draft
          );
        });
        studentParticipants.forEach((studentParticipant) =>
          closeWorkbookStreamClientByUser(sessionId, studentParticipant.userId)
        );
        saveDb();
        return json(res, 200, {
          ok: true,
          session: serializeWorkbookSession(db, session, {
            id: actorUser.id,
            role: actorUser.role,
          }),
        });
      }

      const workbookDuplicateMatch = path.match(
        /^\/api\/workbook\/sessions\/([^/]+)\/duplicate$/
      );
      if (workbookDuplicateMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sourceSessionId = decodeURIComponent(workbookDuplicateMatch[1]);
        const sourceSession = getWorkbookSessionById(db, sourceSessionId);
        if (!sourceSession) {
          return json(res, 404, { error: "Сессия не найдена." });
        }
        if (!canActorAccessWorkbookSession(db, sourceSessionId, actorUser.id)) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        const timestamp = nowIso();
        const session: WorkbookSessionRecord = {
          id: ensureId(),
          kind: "PERSONAL",
          createdBy: actorUser.id,
          status: "in_progress",
          title: `${sourceSession.title} (копия)`,
          createdAt: timestamp,
          startedAt: timestamp,
          endedAt: null,
          lastActivityAt: timestamp,
          context: sourceSession.context ?? null,
        };
        db.workbookSessions.push(session);
        db.workbookParticipants.push({
          sessionId: session.id,
          userId: actorUser.id,
          roleInSession: actorUser.role,
          permissions: stringifyWorkbookPermissions(
            defaultWorkbookPermissions(actorUser.role, "PERSONAL")
          ),
          joinedAt: timestamp,
          leftAt: null,
          isActive: true,
          lastSeenAt: timestamp,
        });
        const sourceSnapshots = db.workbookSnapshots.filter(
          (snapshot) => snapshot.sessionId === sourceSessionId
        );
        sourceSnapshots.forEach((snapshot) => {
          db.workbookSnapshots.push({
            id: ensureId(),
            sessionId: session.id,
            layer: snapshot.layer,
            version: snapshot.version,
            payload: snapshot.payload,
            createdAt: timestamp,
          });
        });
        const draft = ensureWorkbookDraft(db, {
          ownerUserId: actorUser.id,
          session,
          statusForCard: "in_progress",
          timestamp,
        });
        saveDb();
        return json(res, 200, {
          session: serializeWorkbookSession(db, session, {
            id: actorUser.id,
            role: actorUser.role,
          }),
          draft: serializeWorkbookDraftCard(db, draft, {
            id: actorUser.id,
            role: actorUser.role,
          }),
        });
      }

      const workbookSettingsMatch = path.match(
        /^\/api\/workbook\/sessions\/([^/]+)\/settings$/
      );
      if (workbookSettingsMatch && method === "PUT") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookSettingsMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) return json(res, 404, { error: "Сессия не найдена." });
        const participant = getWorkbookParticipant(db, sessionId, actorUser.id);
        if (!participant) return json(res, 403, { error: "Нет доступа к сессии." });
        const permissions = parseWorkbookPermissions(
          participant.permissions,
          actorUser.role,
          session.kind
        );
        if (!permissions.canManageSession) {
          return json(res, 403, {
            error: "Настройки коллективной сессии может менять только учитель.",
          });
        }
        const body = (await readBody(req)) as Partial<WorkbookSessionSettingsPayload>;
        const current = parseWorkbookSettingsFromSession(session);
        const next: WorkbookSessionSettingsPayload = {
          undoPolicy:
            body.undoPolicy === "everyone" ||
            body.undoPolicy === "teacher_only" ||
            body.undoPolicy === "own_only"
              ? body.undoPolicy
              : current.undoPolicy,
          strictGeometry:
            typeof body.strictGeometry === "boolean"
              ? body.strictGeometry
              : current.strictGeometry,
          smartInk: {
            mode:
              body.smartInk?.mode === "off" ||
              body.smartInk?.mode === "basic" ||
              body.smartInk?.mode === "full"
                ? body.smartInk.mode
                : current.smartInk.mode,
            confidenceThreshold:
              typeof body.smartInk?.confidenceThreshold === "number" &&
              Number.isFinite(body.smartInk.confidenceThreshold)
                ? Math.max(0.35, Math.min(0.98, body.smartInk.confidenceThreshold))
                : current.smartInk.confidenceThreshold,
            smartShapes:
              typeof body.smartInk?.smartShapes === "boolean"
                ? body.smartInk.smartShapes
                : current.smartInk.smartShapes,
            smartTextOcr:
              typeof body.smartInk?.smartTextOcr === "boolean"
                ? body.smartInk.smartTextOcr
                : current.smartInk.smartTextOcr,
            smartMathOcr:
              typeof body.smartInk?.smartMathOcr === "boolean"
                ? body.smartInk.smartMathOcr
                : current.smartInk.smartMathOcr,
          },
          studentControls: {
            canDraw:
              typeof body.studentControls?.canDraw === "boolean"
                ? body.studentControls.canDraw
                : current.studentControls.canDraw,
            canSelect:
              typeof body.studentControls?.canSelect === "boolean"
                ? body.studentControls.canSelect
                : current.studentControls.canSelect,
            canDelete:
              typeof body.studentControls?.canDelete === "boolean"
                ? body.studentControls.canDelete
                : current.studentControls.canDelete,
            canInsertImage:
              typeof body.studentControls?.canInsertImage === "boolean"
                ? body.studentControls.canInsertImage
                : current.studentControls.canInsertImage,
            canClear:
              typeof body.studentControls?.canClear === "boolean"
                ? body.studentControls.canClear
                : current.studentControls.canClear,
            canExport:
              typeof body.studentControls?.canExport === "boolean"
                ? body.studentControls.canExport
                : current.studentControls.canExport,
            canUseLaser:
              typeof body.studentControls?.canUseLaser === "boolean"
                ? body.studentControls.canUseLaser
                : current.studentControls.canUseLaser,
          },
        };
        const timestamp = nowIso();
        writeWorkbookSettingsToSession(session, next);
        applyWorkbookStudentControls(db, session, next);
        touchWorkbookSessionActivity(session, timestamp);
        appendWorkbookEvent(db, {
          sessionId,
          authorUserId: actorUser.id,
          type: "settings.update",
          payload: { settings: next },
          createdAt: timestamp,
        });
        saveDb();
        return json(res, 200, {
          ok: true,
          session: serializeWorkbookSession(db, session, {
            id: actorUser.id,
            role: actorUser.role,
          }),
        });
      }

      const workbookInviteCreateMatch = path.match(
        /^\/api\/workbook\/sessions\/([^/]+)\/invite$/
      );
      if (workbookInviteCreateMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookInviteCreateMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) return json(res, 404, { error: "Сессия не найдена." });
        if (session.kind !== "CLASS") {
          return json(res, 409, { error: "Приглашения доступны только для CLASS-сессий." });
        }
        const participant = getWorkbookParticipant(db, sessionId, actorUser.id);
        if (!participant) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        const permissions = parseWorkbookPermissions(
          participant.permissions,
          actorUser.role,
          session.kind
        );
        if (!permissions.canInvite) {
          return json(res, 403, {
            error: "Создавать invite-link может только преподаватель.",
          });
        }
        const timestamp = nowIso();
        const token = crypto.randomBytes(24).toString("hex");
        const invite: WorkbookInviteRecord = {
          id: ensureId(),
          sessionId,
          token,
          createdBy: actorUser.id,
          createdAt: timestamp,
          expiresAt: new Date(nowTs() + WORKBOOK_INVITE_TTL_MS).toISOString(),
          maxUses: null,
          useCount: 0,
          revokedAt: null,
        };
        db.workbookInvites.push(invite);
        saveDb();
        const origin = `${
          req.headers["x-forwarded-proto"] === "https" ? "https" : "http"
        }://${req.headers.host ?? "localhost:5173"}`;
        return json(res, 200, {
          inviteId: invite.id,
          sessionId: invite.sessionId,
          token: invite.token,
          inviteUrl: `${origin}/workbook/invite/${invite.token}`,
          expiresAt: invite.expiresAt,
          maxUses: invite.maxUses,
          useCount: invite.useCount,
        });
      }

      const workbookInviteResolveMatch = path.match(
        /^\/api\/workbook\/invites\/([^/]+)$/
      );
      if (workbookInviteResolveMatch && method === "GET") {
        const token = decodeURIComponent(workbookInviteResolveMatch[1]);
        const invite = db.workbookInvites.find((item) => item.token === token) ?? null;
        if (!invite) return json(res, 404, { error: "Приглашение не найдено." });
        const session = getWorkbookSessionById(db, invite.sessionId);
        if (!session) return json(res, 404, { error: "Сессия не найдена." });
        const host = db.users.find((user) => user.id === session.createdBy) ?? null;
        return json(res, 200, {
          sessionId: session.id,
          title: session.title,
          kind: session.kind,
          hostName: toDisplayName(host ?? undefined),
          ended: session.status === "ended",
          expired: isWorkbookInviteExpired(invite),
          revoked: Boolean(invite.revokedAt),
        });
      }

      const workbookInviteJoinMatch = path.match(
        /^\/api\/workbook\/invites\/([^/]+)\/join$/
      );
      if (workbookInviteJoinMatch && method === "POST") {
        const body = (await readBody(req)) as {
          guestName?: unknown;
        };
        const token = decodeURIComponent(workbookInviteJoinMatch[1]);
        const invite = db.workbookInvites.find((item) => item.token === token) ?? null;
        if (!invite) return json(res, 404, { error: "Приглашение не найдено." });
        if (invite.revokedAt) {
          return json(res, 409, { error: "Приглашение отозвано." });
        }
        if (isWorkbookInviteExpired(invite)) {
          return json(res, 409, { error: "Срок действия приглашения истек." });
        }
        if (
          typeof invite.maxUses === "number" &&
          invite.maxUses > 0 &&
          invite.useCount >= invite.maxUses
        ) {
          return json(res, 409, { error: "Лимит использований приглашения исчерпан." });
        }
        const session = getWorkbookSessionById(db, invite.sessionId);
        if (!session) return json(res, 404, { error: "Сессия не найдена." });
        if (session.kind !== "CLASS") {
          return json(res, 409, { error: "Приглашение доступно только для CLASS-сессии." });
        }
        if (session.status === "ended") {
          return json(res, 409, {
            error:
              "Ссылка больше не активна: коллективный урок уже завершен преподавателем.",
          });
        }

        const timestamp = nowIso();
        let resolvedActorUser = actorUser;
        if (!resolvedActorUser) {
          const guestName = normalizeWorkbookGuestName(body?.guestName);
          if (!guestName) {
            return json(res, 401, { error: "Укажите имя для входа по приглашению." });
          }
          resolvedActorUser = createWorkbookGuestUser(db, guestName);
          const guestSession = createAuthSession(
            db,
            {
              userId: resolvedActorUser.id,
              email: resolvedActorUser.email,
              role: "student",
            },
            timestamp
          );
          setSessionCookie(res, guestSession.id);
        }
        let participant = getWorkbookParticipant(db, session.id, resolvedActorUser.id);
        if (!participant) {
          const settings = parseWorkbookSettingsFromSession(session);
          const basePermissions = defaultWorkbookPermissions(
            resolvedActorUser.role,
            session.kind
          );
          const normalizedPermissions =
            resolvedActorUser.role === "student"
              ? {
                  ...basePermissions,
                  canDraw: settings.studentControls.canDraw,
                  canSelect: settings.studentControls.canSelect,
                  canDelete: settings.studentControls.canDelete,
                  canInsertImage: settings.studentControls.canInsertImage,
                  canClear: settings.studentControls.canClear,
                  canExport: settings.studentControls.canExport,
                  canUseLaser: settings.studentControls.canUseLaser,
                }
              : basePermissions;
          participant = {
            sessionId: session.id,
            userId: resolvedActorUser.id,
            roleInSession: resolvedActorUser.role,
            permissions: stringifyWorkbookPermissions(normalizedPermissions),
            joinedAt: timestamp,
            leftAt: null,
            isActive: true,
            lastSeenAt: timestamp,
          };
          db.workbookParticipants.push(participant);
          invite.useCount += 1;
        } else {
          participant.isActive = true;
          participant.lastSeenAt = timestamp;
          participant.leftAt = null;
        }
        touchWorkbookSessionActivity(session, timestamp);
        const draft = ensureWorkbookDraft(db, {
          ownerUserId: resolvedActorUser.id,
          session,
          statusForCard: "in_progress",
          timestamp,
        });
        saveDb();
        return json(res, 200, {
          session: serializeWorkbookSession(db, session, {
            id: resolvedActorUser.id,
            role: resolvedActorUser.role,
          }),
          draft: serializeWorkbookDraftCard(db, draft, {
            id: resolvedActorUser.id,
            role: resolvedActorUser.role,
          }),
        });
      }

      const workbookEventsMatch = path.match(
        /^\/api\/workbook\/sessions\/([^/]+)\/events$/
      );
      const workbookEventsStreamMatch = path.match(
        /^\/api\/workbook\/sessions\/([^/]+)\/events\/stream$/
      );
      if (workbookEventsStreamMatch && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookEventsStreamMatch[1]);
        if (!canActorAccessWorkbookSession(db, sessionId, actorUser.id)) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        const clientId = ensureId();
        const heartbeatTimer = setInterval(() => {
          if (res.writableEnded || res.destroyed) {
            removeWorkbookStreamClient(sessionId, clientId);
            return;
          }
          try {
            res.write(": ping\n\n");
          } catch {
            removeWorkbookStreamClient(sessionId, clientId);
          }
        }, 15_000);

        const sessionClients =
          workbookStreamClientsBySession.get(sessionId) ?? new Map<string, WorkbookStreamClient>();
        sessionClients.set(clientId, {
          id: clientId,
          userId: actorUser.id,
          res,
          heartbeatTimer,
        });
        workbookStreamClientsBySession.set(sessionId, sessionClients);

        const latestSeq =
          db.workbookEvents
            .filter((event) => event.sessionId === sessionId)
            .sort((a, b) => b.seq - a.seq)[0]?.seq ?? 0;
        res.write("retry: 1200\n");
        res.write(
          `event: workbook\ndata: ${JSON.stringify({
            sessionId,
            latestSeq,
            events: [],
          })}\n\n`
        );

        const close = () => {
          removeWorkbookStreamClient(sessionId, clientId);
        };
        req.on("close", close);
        res.on("close", close);
        return;
      }

      if (workbookEventsMatch && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookEventsMatch[1]);
        if (!canActorAccessWorkbookSession(db, sessionId, actorUser.id)) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        const afterSeqRaw = url.searchParams.get("afterSeq");
        const afterSeq = Number.isFinite(Number(afterSeqRaw))
          ? Math.max(0, Number(afterSeqRaw))
          : 0;
        const events = db.workbookEvents
          .filter((event) => event.sessionId === sessionId && event.seq > afterSeq)
          .sort((a, b) => a.seq - b.seq);
        const latestSeq =
          db.workbookEvents
            .filter((event) => event.sessionId === sessionId)
            .sort((a, b) => b.seq - a.seq)[0]?.seq ?? 0;
        return json(res, 200, {
          sessionId,
          latestSeq,
          events: events.map((event) => ({
            id: event.id,
            sessionId: event.sessionId,
            seq: event.seq,
            authorUserId: event.authorUserId,
            type: event.type,
            payload: parseWorkbookPayload(event.payload),
            createdAt: event.createdAt,
          })),
        });
      }

      if (workbookEventsMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookEventsMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) return json(res, 404, { error: "Сессия не найдена." });
        const participant = getWorkbookParticipant(db, sessionId, actorUser.id);
        if (!participant) return json(res, 403, { error: "Нет доступа к сессии." });
        const permissions = parseWorkbookPermissions(
          participant.permissions,
          actorUser.role,
          session.kind
        );
        const body = (await readBody(req)) as {
          events?: Array<{ type?: unknown; payload?: unknown }>;
        };
        const incoming = Array.isArray(body?.events) ? body.events.slice(0, 30) : [];
        if (incoming.length === 0) {
          return json(res, 400, { error: "События не переданы." });
        }
        const settings = parseWorkbookSettingsFromSession(session);
        const isTeacherActor =
          participant.roleInSession === "teacher" || permissions.canManageSession;
        const canUseUndo =
          session.kind === "PERSONAL" ||
          settings.undoPolicy === "everyone" ||
          (settings.undoPolicy === "teacher_only" && isTeacherActor) ||
          (settings.undoPolicy === "own_only" && isTeacherActor);

        const timestamp = nowIso();
        const created = incoming
          .map((candidate) => {
            const type = typeof candidate.type === "string" ? candidate.type : "";
            if (!type) return null;
            let normalizedPayload = candidate.payload ?? {};
            if (type === "board.stroke" && !permissions.canDraw) return null;
            if (type === "annotations.stroke" && !permissions.canAnnotate) return null;
            if (
              (type === "board.stroke.delete" || type === "annotations.stroke.delete") &&
              !permissions.canDelete
            ) {
              return null;
            }
            if (
              (type === "board.clear" || type === "annotations.clear") &&
              !permissions.canClear
            ) {
              return null;
            }
            if (
              (type === "board.object.create" || type === "board.object.update") &&
              (!permissions.canDraw || !permissions.canSelect)
            ) {
              return null;
            }
            if (type === "board.object.delete" && !permissions.canDelete) return null;
            if (type === "document.asset.add" && !permissions.canInsertImage) return null;
            if (type === "focus.point" && !permissions.canUseLaser) return null;
            if ((type === "media.signal" || type === "media.state") && !permissions.canUseMedia) {
              return null;
            }
            if (type === "chat.message" && !permissions.canUseChat) return null;
            if ((type === "board.undo" || type === "board.redo") && !canUseUndo) return null;
            if (type === "settings.update" && !permissions.canManageSession) return null;
            if (type === "permissions.update" && !permissions.canManageSession) return null;
            if (
              (type === "geometry.constraint.add" ||
                type === "geometry.constraint.remove") &&
              !permissions.canManageSession
            ) {
              return null;
            }
            if (
              (type === "board.settings.update" || type === "timer.update") &&
              session.kind === "CLASS" &&
              !permissions.canManageSession
            ) {
              return null;
            }
            if (
              (type === "library.folder.upsert" ||
                type === "library.folder.remove" ||
                type === "library.item.upsert" ||
                type === "library.item.remove" ||
                type === "library.formula.upsert" ||
                type === "library.template.upsert" ||
                type === "library.template.remove") &&
              !permissions.canInsertImage
            ) {
              return null;
            }
            if ((type === "comments.upsert" || type === "comments.remove") && !permissions.canDraw) {
              return null;
            }

            if (type === "settings.update") {
              const nextSettings = (
                candidate.payload && typeof candidate.payload === "object"
                  ? (candidate.payload as { settings?: unknown }).settings
                  : null
              ) as Partial<WorkbookSessionSettingsPayload> | null;
              if (nextSettings) {
                const merged: WorkbookSessionSettingsPayload = {
                  undoPolicy:
                    nextSettings.undoPolicy === "everyone" ||
                    nextSettings.undoPolicy === "teacher_only" ||
                    nextSettings.undoPolicy === "own_only"
                      ? nextSettings.undoPolicy
                      : settings.undoPolicy,
                  strictGeometry:
                    typeof nextSettings.strictGeometry === "boolean"
                      ? nextSettings.strictGeometry
                      : settings.strictGeometry,
                  smartInk: {
                    mode:
                      nextSettings.smartInk?.mode === "off" ||
                      nextSettings.smartInk?.mode === "basic" ||
                      nextSettings.smartInk?.mode === "full"
                        ? nextSettings.smartInk.mode
                        : settings.smartInk.mode,
                    confidenceThreshold:
                      typeof nextSettings.smartInk?.confidenceThreshold === "number" &&
                      Number.isFinite(nextSettings.smartInk.confidenceThreshold)
                        ? Math.max(0.35, Math.min(0.98, nextSettings.smartInk.confidenceThreshold))
                        : settings.smartInk.confidenceThreshold,
                    smartShapes:
                      typeof nextSettings.smartInk?.smartShapes === "boolean"
                        ? nextSettings.smartInk.smartShapes
                        : settings.smartInk.smartShapes,
                    smartTextOcr:
                      typeof nextSettings.smartInk?.smartTextOcr === "boolean"
                        ? nextSettings.smartInk.smartTextOcr
                        : settings.smartInk.smartTextOcr,
                    smartMathOcr:
                      typeof nextSettings.smartInk?.smartMathOcr === "boolean"
                        ? nextSettings.smartInk.smartMathOcr
                        : settings.smartInk.smartMathOcr,
                  },
                  studentControls: {
                    canDraw:
                      typeof nextSettings.studentControls?.canDraw === "boolean"
                        ? nextSettings.studentControls.canDraw
                        : settings.studentControls.canDraw,
                    canSelect:
                      typeof nextSettings.studentControls?.canSelect === "boolean"
                        ? nextSettings.studentControls.canSelect
                        : settings.studentControls.canSelect,
                    canDelete:
                      typeof nextSettings.studentControls?.canDelete === "boolean"
                        ? nextSettings.studentControls.canDelete
                        : settings.studentControls.canDelete,
                    canInsertImage:
                      typeof nextSettings.studentControls?.canInsertImage === "boolean"
                        ? nextSettings.studentControls.canInsertImage
                        : settings.studentControls.canInsertImage,
                    canClear:
                      typeof nextSettings.studentControls?.canClear === "boolean"
                        ? nextSettings.studentControls.canClear
                        : settings.studentControls.canClear,
                    canExport:
                      typeof nextSettings.studentControls?.canExport === "boolean"
                        ? nextSettings.studentControls.canExport
                        : settings.studentControls.canExport,
                    canUseLaser:
                      typeof nextSettings.studentControls?.canUseLaser === "boolean"
                        ? nextSettings.studentControls.canUseLaser
                        : settings.studentControls.canUseLaser,
                  },
                };
                writeWorkbookSettingsToSession(session, merged);
                applyWorkbookStudentControls(db, session, merged);
              }
            }
            if (type === "board.settings.update") {
              const nextBoardSettings =
                normalizedPayload && typeof normalizedPayload === "object"
                  ? (normalizedPayload as { boardSettings?: unknown }).boardSettings
                  : null;
              if (
                nextBoardSettings &&
                typeof nextBoardSettings === "object" &&
                typeof (nextBoardSettings as { title?: unknown }).title === "string"
              ) {
                const nextTitle = (nextBoardSettings as { title: string }).title.trim();
                if (nextTitle.length > 0) {
                  session.title = nextTitle;
                  db.workbookDrafts = db.workbookDrafts.map((draft) =>
                    draft.sessionId === sessionId ? { ...draft, title: nextTitle } : draft
                  );
                }
              }
            }

            if (type === "permissions.update") {
              const payload =
                normalizedPayload && typeof normalizedPayload === "object"
                  ? (normalizedPayload as {
                      userId?: unknown;
                      permissions?: unknown;
                    })
                  : null;
              if (!payload) return null;
              const targetUserId =
                payload && typeof payload.userId === "string" ? payload.userId : "";
              if (!targetUserId) return null;
              const targetParticipant = getWorkbookParticipant(db, sessionId, targetUserId);
              if (!targetParticipant || targetParticipant.roleInSession !== "student") {
                return null;
              }
              const currentTargetPermissions = parseWorkbookPermissions(
                targetParticipant.permissions,
                "student",
                session.kind
              );
              const patch =
                payload.permissions && typeof payload.permissions === "object"
                  ? (payload.permissions as Partial<WorkbookPermissionPayload>)
                  : {};
              const nextPermissions: WorkbookPermissionPayload = {
                ...currentTargetPermissions,
                canDraw:
                  typeof patch.canDraw === "boolean"
                    ? patch.canDraw
                    : currentTargetPermissions.canDraw,
                canAnnotate:
                  typeof patch.canAnnotate === "boolean"
                    ? patch.canAnnotate
                    : currentTargetPermissions.canAnnotate,
                canUseMedia:
                  typeof patch.canUseMedia === "boolean"
                    ? patch.canUseMedia
                    : currentTargetPermissions.canUseMedia,
                canUseChat:
                  typeof patch.canUseChat === "boolean"
                    ? patch.canUseChat
                    : currentTargetPermissions.canUseChat,
                canInvite:
                  typeof patch.canInvite === "boolean"
                    ? patch.canInvite
                    : currentTargetPermissions.canInvite,
                canManageSession:
                  typeof patch.canManageSession === "boolean"
                    ? patch.canManageSession
                    : currentTargetPermissions.canManageSession,
                canSelect:
                  typeof patch.canSelect === "boolean"
                    ? patch.canSelect
                    : currentTargetPermissions.canSelect,
                canDelete:
                  typeof patch.canDelete === "boolean"
                    ? patch.canDelete
                    : currentTargetPermissions.canDelete,
                canInsertImage:
                  typeof patch.canInsertImage === "boolean"
                    ? patch.canInsertImage
                    : currentTargetPermissions.canInsertImage,
                canClear:
                  typeof patch.canClear === "boolean"
                    ? patch.canClear
                    : currentTargetPermissions.canClear,
                canExport:
                  typeof patch.canExport === "boolean"
                    ? patch.canExport
                    : currentTargetPermissions.canExport,
                canUseLaser:
                  typeof patch.canUseLaser === "boolean"
                    ? patch.canUseLaser
                    : currentTargetPermissions.canUseLaser,
              };
              targetParticipant.permissions = stringifyWorkbookPermissions(nextPermissions);
              targetParticipant.lastSeenAt = targetParticipant.lastSeenAt ?? timestamp;
              normalizedPayload = {
                userId: targetUserId,
                permissions: nextPermissions,
              };
            }
            return appendWorkbookEvent(db, {
              sessionId,
              authorUserId: actorUser.id,
              type,
              payload: normalizedPayload,
              createdAt: timestamp,
            });
          })
          .filter((event): event is WorkbookEventRecord => Boolean(event));
        if (created.length === 0) {
          return json(res, 409, { error: "Нет допустимых событий для сохранения." });
        }
        touchWorkbookSessionActivity(session, timestamp);
        participant.lastSeenAt = timestamp;
        participant.isActive = true;
        participant.leftAt = null;
        db.workbookDrafts = db.workbookDrafts.map((draft) =>
          draft.sessionId === sessionId
            ? {
                ...draft,
                statusForCard: session.status === "ended" ? "ended" : "in_progress",
                updatedAt: timestamp,
              }
            : draft
        );
        const serializedEvents = created.map((event) => ({
          id: event.id,
          sessionId: event.sessionId,
          seq: event.seq,
          authorUserId: event.authorUserId,
          type: event.type,
          payload: parseWorkbookPayload(event.payload),
          createdAt: event.createdAt,
        }));
        saveDb();
        publishWorkbookStreamEvents(db, {
          sessionId,
          latestSeq: created[created.length - 1].seq,
          events: serializedEvents,
        });
        return json(res, 200, {
          latestSeq: created[created.length - 1].seq,
          events: serializedEvents,
        });
      }

      const workbookSnapshotMatch = path.match(
        /^\/api\/workbook\/sessions\/([^/]+)\/snapshot$/
      );
      if (workbookSnapshotMatch && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookSnapshotMatch[1]);
        if (!canActorAccessWorkbookSession(db, sessionId, actorUser.id)) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        const layer =
          url.searchParams.get("layer") === "annotations" ? "annotations" : "board";
        const snapshot =
          db.workbookSnapshots.find(
            (item) => item.sessionId === sessionId && item.layer === layer
          ) ?? null;
        if (!snapshot) return json(res, 200, null);
        return json(res, 200, {
          layer: snapshot.layer,
          version: snapshot.version,
          payload: parseWorkbookPayload(snapshot.payload),
          createdAt: snapshot.createdAt,
        });
      }

      if (workbookSnapshotMatch && method === "PUT") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookSnapshotMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) {
          return json(res, 404, { error: "Сессия не найдена." });
        }
        const participant = getWorkbookParticipant(db, sessionId, actorUser.id);
        if (!participant) {
          return json(res, 403, { error: "Нет доступа к сессии." });
        }
        const body = (await readBody(req)) as {
          layer?: "board" | "annotations";
          version?: number;
          payload?: unknown;
        };
        const layer = body?.layer === "annotations" ? "annotations" : "board";
        const version =
          typeof body?.version === "number" && Number.isFinite(body.version)
            ? Math.max(0, Math.floor(body.version))
            : 0;
        const timestamp = nowIso();
        const snapshot = upsertWorkbookSnapshot(db, {
          sessionId,
          layer,
          version,
          payload: body?.payload ?? {},
          timestamp,
        });
        participant.lastSeenAt = timestamp;
        participant.isActive = true;
        participant.leftAt = null;
        touchWorkbookSessionActivity(session, timestamp);
        saveDb();
        return json(res, 200, {
          layer: snapshot.layer,
          version: snapshot.version,
          payload: parseWorkbookPayload(snapshot.payload),
          createdAt: snapshot.createdAt,
        });
      }

      const workbookPresenceMatch = path.match(
        /^\/api\/workbook\/sessions\/([^/]+)\/presence$/
      );
      if (workbookPresenceMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const sessionId = decodeURIComponent(workbookPresenceMatch[1]);
        const session = getWorkbookSessionById(db, sessionId);
        if (!session) return json(res, 404, { error: "Сессия не найдена." });
        const participant = getWorkbookParticipant(db, sessionId, actorUser.id);
        if (!participant) return json(res, 403, { error: "Нет доступа к сессии." });
        const timestamp = nowIso();
        participant.isActive = true;
        participant.leftAt = null;
        participant.lastSeenAt = timestamp;
        touchWorkbookSessionActivity(session, timestamp);
        ensureWorkbookDraft(db, {
          ownerUserId: actorUser.id,
          session,
          statusForCard: session.status === "ended" ? "ended" : "in_progress",
          timestamp,
        });
        saveDb();
        return json(res, 200, {
          ok: true,
          participants: getWorkbookParticipants(db, sessionId).map((item) =>
            serializeWorkbookParticipant(db, item)
          ),
        });
      }

      // ================= CHAT =================
      if (path === "/api/chat/eligibility" && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const eligibility = resolveTeacherChatEligibility(db, {
          id: actorUser.id,
          role: actorUser.role,
        });
        return json(res, 200, {
          available: eligibility.available,
          reason: eligibility.reason,
          hasPremiumAccess: eligibility.hasPremiumAccess,
          hasBookingAccess: eligibility.hasBookingAccess,
          teacherId: eligibility.teacher?.id ?? null,
          teacherName: eligibility.teacher ? toDisplayName(eligibility.teacher) : null,
          teacherPhoto: eligibility.teacher?.photo ?? null,
        });
      }

      if (path === "/api/chat/threads" && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }

        const timestamp = nowIso();
        let mutated = false;

        if (actorUser.role === "student") {
          const eligibility = resolveTeacherChatEligibility(db, {
            id: actorUser.id,
            role: actorUser.role,
          });
          if (!eligibility.available || !eligibility.teacher) {
            return json(res, 403, {
              error:
                "Чат с преподавателем доступен при покупке премиум-курса или записи на индивидуальное занятие.",
              code: "chat_unavailable",
            });
          }
          const existing = db.chatThreads.find(
            (thread) =>
              thread.studentId === actorUser.id &&
              thread.teacherId === eligibility.teacher!.id
          );
          const thread = ensureTeacherChatThread(db, {
            studentId: actorUser.id,
            teacherId: eligibility.teacher.id,
            timestamp,
          });
          if (!existing) {
            mutated = true;
          }
          const messages = getChatThreadMessagesForActor(db, thread.id, actorUser.id);
          const lastMessage = messages[messages.length - 1];
          if (mutated) saveDb();
          return json(res, 200, [
            {
              id: thread.id,
              studentId: actorUser.id,
              studentName: toDisplayName(actorUser),
              studentEmail: actorUser.email,
              studentPhoto: actorUser.photo,
              teacherId: eligibility.teacher.id,
              teacherName: toDisplayName(eligibility.teacher),
              teacherPhoto: eligibility.teacher.photo,
              updatedAt: thread.updatedAt,
              createdAt: thread.createdAt,
              lastMessageText: lastMessage?.deletedForAll
                ? "Сообщение удалено"
                : lastMessage?.text,
              lastMessageAt: lastMessage?.createdAt,
              unreadCount: calculateUnreadForViewer(thread, messages, {
                role: "student",
                id: actorUser.id,
              }),
            },
          ]);
        }

        const teacherId = actorUser.id;
        const teacherName = toDisplayName(actorUser);
        const eligibleStudentIds = new Set(
          db.users
            .filter((user) => user.role === "student")
            .filter(
              (student) =>
                hasPremiumTeacherChatAccess(db, student.id) ||
                hasBookingTeacherChatAccess(db, student.id)
            )
            .map((student) => student.id)
        );

        eligibleStudentIds.forEach((studentId) => {
          const existing = db.chatThreads.find(
            (thread) => thread.studentId === studentId && thread.teacherId === teacherId
          );
          if (existing) return;
          ensureTeacherChatThread(db, { studentId, teacherId, timestamp });
          mutated = true;
        });

        const teacherThreads = db.chatThreads
          .filter((thread) => thread.teacherId === teacherId)
          .filter((thread) => {
            if (eligibleStudentIds.has(thread.studentId)) return true;
            return db.chatMessages.some((message) => message.threadId === thread.id);
          })
          .reduce<
            Array<{
              id: string;
              studentId: string;
              studentName: string;
              studentEmail: string;
              studentPhoto?: string;
              teacherId: string;
              teacherName: string;
              teacherPhoto?: string;
              updatedAt: string;
              createdAt: string;
              lastMessageText?: string;
              lastMessageAt?: string;
              unreadCount: number;
            }>
          >((acc, thread) => {
            const student = db.users.find((item) => item.id === thread.studentId);
            if (!student) return acc;
            const messages = getChatThreadMessagesForActor(db, thread.id, actorUser.id);
            const lastMessage = messages[messages.length - 1];
            acc.push({
              id: thread.id,
              studentId: student.id,
              studentName: toDisplayName(student),
              studentEmail: student.email,
              studentPhoto: student.photo,
              teacherId,
              teacherName,
              teacherPhoto: actorUser.photo,
              updatedAt: thread.updatedAt,
              createdAt: thread.createdAt,
              lastMessageText: lastMessage?.deletedForAll
                ? "Сообщение удалено"
                : lastMessage?.text,
              lastMessageAt: lastMessage?.createdAt,
              unreadCount: calculateUnreadForViewer(thread, messages, {
                role: "teacher",
                id: actorUser.id,
              }),
            });
            return acc;
          }, [])
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        if (mutated) saveDb();
        return json(res, 200, teacherThreads);
      }

      if (path === "/api/chat/messages" && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const threadId = decodeURIComponent(url.searchParams.get("threadId") ?? "");
        if (!threadId) {
          return json(res, 400, { error: "Не передан threadId." });
        }
        const thread = db.chatThreads.find((item) => item.id === threadId);
        if (!thread) {
          return json(res, 404, { error: "Диалог не найден." });
        }
        if (!canActorAccessChatThread(thread, actorUser)) {
          return json(res, 403, { error: "Нет доступа к диалогу." });
        }
        if (actorUser.role === "student") {
          const eligibility = resolveTeacherChatEligibility(db, {
            id: actorUser.id,
            role: actorUser.role,
          });
          if (!eligibility.available) {
            return json(res, 403, {
              error:
                "Чат с преподавателем доступен при покупке премиум-курса или записи на индивидуальное занятие.",
              code: "chat_unavailable",
            });
          }
        }
        const messages = getChatThreadMessagesForActor(db, thread.id, actorUser.id);
        const peerReadAt =
          actorUser.role === "student"
            ? thread.teacherLastReadAt
            : thread.studentLastReadAt;
        updateThreadReadMark(thread, actorUser.role, nowIso());
        saveDb();
        return json(
          res,
          200,
          messages.map((message) => {
            const readByPeer =
              message.senderId === actorUser.id && peerReadAt
                ? message.createdAt <= peerReadAt
                : undefined;
            return serializeChatMessage(db, message, { readByPeer });
          })
        );
      }

      if (path === "/api/chat/messages" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as {
          threadId?: string;
          text?: string;
          attachments?: unknown;
        };
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        const attachments = sanitizeAttachmentsInput(body?.attachments);
        const hasText = text.length > 0;
        const hasAttachments = attachments.length > 0;
        if (!hasText && !hasAttachments) {
          return json(res, 400, { error: "Введите сообщение или прикрепите файл." });
        }
        if (text.length > 3000) {
          return json(res, 400, { error: "Слишком длинное сообщение." });
        }

        const timestamp = nowIso();
        let thread: ChatThreadRecord | null = null;

        if (actorUser.role === "student") {
          const eligibility = resolveTeacherChatEligibility(db, {
            id: actorUser.id,
            role: actorUser.role,
          });
          if (!eligibility.available || !eligibility.teacher) {
            return json(res, 403, {
              error:
                "Чат с преподавателем доступен при покупке премиум-курса или записи на индивидуальное занятие.",
              code: "chat_unavailable",
            });
          }
          thread = ensureTeacherChatThread(db, {
            studentId: actorUser.id,
            teacherId: eligibility.teacher.id,
            timestamp,
          });
        } else {
          const requestedThreadId =
            typeof body?.threadId === "string" ? body.threadId.trim() : "";
          if (!requestedThreadId) {
            return json(res, 400, { error: "Выберите диалог." });
          }
          thread =
            db.chatThreads.find((item) => item.id === requestedThreadId) ?? null;
          if (!thread) {
            return json(res, 404, { error: "Диалог не найден." });
          }
          if (!canActorAccessChatThread(thread, actorUser)) {
            return json(res, 403, { error: "Нет доступа к диалогу." });
          }
        }

        const message: ChatMessageRecord = {
          id: ensureId(),
          threadId: thread.id,
          senderId: actorUser.id,
          senderRole: actorUser.role,
          text,
          attachments,
          editedAt: null,
          deletedForAll: false,
          deletedForUserIds: [],
          createdAt: timestamp,
        };
        db.chatMessages.push(message);
        thread.lastMessageId = message.id;
        thread.updatedAt = timestamp;
        updateThreadReadMark(thread, actorUser.role, timestamp);
        saveDb();
        const peerReadAt =
          actorUser.role === "student"
            ? thread.teacherLastReadAt
            : thread.studentLastReadAt;
        const readByPeer =
          message.senderId === actorUser.id && peerReadAt
            ? message.createdAt <= peerReadAt
            : false;
        return json(res, 200, serializeChatMessage(db, message, { readByPeer }));
      }

      const editChatMessageMatch = path.match(/^\/api\/chat\/messages\/([^/]+)$/);
      if (editChatMessageMatch && method === "PUT") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const messageId = decodeURIComponent(editChatMessageMatch[1]);
        const body = (await readBody(req)) as {
          threadId?: string;
          text?: string;
          attachments?: unknown;
        };
        const threadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
        if (!threadId) {
          return json(res, 400, { error: "Не передан threadId." });
        }
        const thread = db.chatThreads.find((item) => item.id === threadId);
        if (!thread) {
          return json(res, 404, { error: "Диалог не найден." });
        }
        if (!canActorAccessChatThread(thread, actorUser)) {
          return json(res, 403, { error: "Нет доступа к диалогу." });
        }
        const messageIndex = db.chatMessages.findIndex(
          (item) => item.id === messageId && item.threadId === thread.id
        );
        if (messageIndex === -1) {
          return json(res, 404, { error: "Сообщение не найдено." });
        }
        const message = normalizeStoredChatMessage(db.chatMessages[messageIndex]);
        if (message.senderId !== actorUser.id) {
          return json(res, 403, { error: "Редактировать можно только свои сообщения." });
        }
        if (message.deletedForAll) {
          return json(res, 409, { error: "Удаленное сообщение нельзя редактировать." });
        }
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        const attachments = sanitizeAttachmentsInput(body?.attachments);
        if (!text && attachments.length === 0) {
          return json(res, 400, { error: "Введите сообщение или прикрепите файл." });
        }
        if (text.length > 3000) {
          return json(res, 400, { error: "Слишком длинное сообщение." });
        }
        const timestamp = nowIso();
        const nextMessage: ChatMessageRecord = {
          ...message,
          text,
          attachments,
          editedAt: timestamp,
        };
        db.chatMessages[messageIndex] = nextMessage;
        thread.updatedAt = timestamp;
        saveDb();
        const peerReadAt =
          actorUser.role === "student"
            ? thread.teacherLastReadAt
            : thread.studentLastReadAt;
        const readByPeer =
          nextMessage.senderId === actorUser.id && peerReadAt
            ? nextMessage.createdAt <= peerReadAt
            : false;
        return json(res, 200, serializeChatMessage(db, nextMessage, { readByPeer }));
      }

      const deleteChatMessageMatch = path.match(
        /^\/api\/chat\/messages\/([^/]+)\/delete$/
      );
      if (deleteChatMessageMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const messageId = decodeURIComponent(deleteChatMessageMatch[1]);
        const body = (await readBody(req)) as {
          threadId?: string;
          scope?: "self" | "all";
        };
        const threadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
        if (!threadId) {
          return json(res, 400, { error: "Не передан threadId." });
        }
        const scope = body?.scope === "all" ? "all" : "self";
        const thread = db.chatThreads.find((item) => item.id === threadId);
        if (!thread) {
          return json(res, 404, { error: "Диалог не найден." });
        }
        if (!canActorAccessChatThread(thread, actorUser)) {
          return json(res, 403, { error: "Нет доступа к диалогу." });
        }
        const messageIndex = db.chatMessages.findIndex(
          (item) => item.id === messageId && item.threadId === thread.id
        );
        if (messageIndex === -1) {
          return json(res, 404, { error: "Сообщение не найдено." });
        }
        const message = normalizeStoredChatMessage(db.chatMessages[messageIndex]);
        if (message.senderId !== actorUser.id) {
          return json(res, 403, { error: "Удалять можно только свои сообщения." });
        }
        const timestamp = nowIso();
        if (scope === "all") {
          db.chatMessages[messageIndex] = {
            ...message,
            text: "",
            attachments: [],
            deletedForAll: true,
            deletedForUserIds: [],
            editedAt: timestamp,
          };
        } else {
          const deletedForUserIds = new Set(message.deletedForUserIds ?? []);
          deletedForUserIds.add(actorUser.id);
          db.chatMessages[messageIndex] = {
            ...message,
            deletedForUserIds: [...deletedForUserIds],
          };
        }
        updateThreadReadMark(thread, actorUser.role, timestamp);
        saveDb();
        return json(res, 200, { ok: true });
      }

      const clearChatThreadMatch = path.match(
        /^\/api\/chat\/threads\/([^/]+)\/clear$/
      );
      if (clearChatThreadMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        if (actorUser.role !== "teacher") {
          return json(res, 403, { error: "Очистка переписки доступна только преподавателю." });
        }
        const threadId = decodeURIComponent(clearChatThreadMatch[1]);
        const thread = db.chatThreads.find((item) => item.id === threadId);
        if (!thread) {
          return json(res, 404, { error: "Диалог не найден." });
        }
        if (!canActorAccessChatThread(thread, actorUser)) {
          return json(res, 403, { error: "Нет доступа к диалогу." });
        }
        db.chatMessages = db.chatMessages.filter(
          (message) => message.threadId !== thread.id
        );
        thread.lastMessageId = null;
        const timestamp = nowIso();
        thread.updatedAt = timestamp;
        thread.studentLastReadAt = timestamp;
        thread.teacherLastReadAt = timestamp;
        // Full clear must be immediately visible for both participants.
        saveDb();
        return json(res, 200, { ok: true });
      }

      if (path === "/api/chat/threads/mark-read" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const body = (await readBody(req)) as { threadId?: string };
        const threadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
        if (!threadId) {
          return json(res, 400, { error: "Не передан threadId." });
        }
        const thread = db.chatThreads.find((item) => item.id === threadId);
        if (!thread) {
          return json(res, 404, { error: "Диалог не найден." });
        }
        if (!canActorAccessChatThread(thread, actorUser)) {
          return json(res, 403, { error: "Нет доступа к диалогу." });
        }
        if (actorUser.role === "student") {
          const eligibility = resolveTeacherChatEligibility(db, {
            id: actorUser.id,
            role: actorUser.role,
          });
          if (!eligibility.available) {
            return json(res, 403, {
              error:
                "Чат с преподавателем доступен при покупке премиум-курса или записи на индивидуальное занятие.",
              code: "chat_unavailable",
            });
          }
        }
        updateThreadReadMark(thread, actorUser.role, nowIso());
        saveDb();
        return json(res, 200, { ok: true });
      }

      // ================= ACCESS =================
      if (path === "/api/access/courses" && method === "GET") {
        const requestedUserId = decodeURIComponent(
          url.searchParams.get("userId") ?? ""
        );
        if (
          actorUser &&
          actorUser.role !== "teacher" &&
          requestedUserId &&
          requestedUserId !== actorUser.id
        ) {
          return json(res, 403, { error: "Недопустимый контекст доступа." });
        }
        const userId = actorUser
          ? actorUser.role === "teacher"
            ? requestedUserId || actorUser.id
            : actorUser.id
          : undefined;
        const decisions = db.courses.map((course) =>
          buildCourseAccessDecision(db, course.id, userId)
        );
        return json(res, 200, { decisions });
      }

      const accessCourseMatch = path.match(/^\/api\/access\/courses\/([^/]+)$/);
      if (accessCourseMatch && method === "GET") {
        const courseId = decodeURIComponent(accessCourseMatch[1]);
        const requestedUserId = decodeURIComponent(
          url.searchParams.get("userId") ?? ""
        );
        if (
          actorUser &&
          actorUser.role !== "teacher" &&
          requestedUserId &&
          requestedUserId !== actorUser.id
        ) {
          return json(res, 403, { error: "Недопустимый контекст доступа." });
        }
        const userId = actorUser
          ? actorUser.role === "teacher"
            ? requestedUserId || actorUser.id
            : actorUser.id
          : undefined;
        const decision = buildCourseAccessDecision(db, courseId, userId);
        return json(res, 200, decision);
      }

      const accessLessonMatch = path.match(/^\/api\/access\/lessons\/([^/]+)$/);
      if (accessLessonMatch && method === "GET") {
        const lessonId = decodeURIComponent(accessLessonMatch[1]);
        const requestedUserId = decodeURIComponent(
          url.searchParams.get("userId") ?? ""
        );
        if (
          actorUser &&
          actorUser.role !== "teacher" &&
          requestedUserId &&
          requestedUserId !== actorUser.id
        ) {
          return json(res, 403, { error: "Недопустимый контекст доступа." });
        }
        const userId = actorUser
          ? actorUser.role === "teacher"
            ? requestedUserId || actorUser.id
            : actorUser.id
          : undefined;
        const decision = buildLessonAccessDecision(db, lessonId, userId);
        return json(res, 200, decision);
      }

      // ================= ASSESSMENTS =================
      if (path === "/api/assessments/state" && method === "GET") {
        db.assessments = normalizeAssessmentState(db.assessments);
        return json(res, 200, db.assessments);
      }

      if (path === "/api/assessments/state" && method === "PUT") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const nextState = (await readBody(req)) as AssessmentStorageState | null;
        db.assessments = normalizeAssessmentState(nextState);
        saveDb();
        return json(res, 200, db.assessments);
      }

      if (path === "/api/assessments/sessions" && method === "GET") {
        db.assessmentSessions = pruneAssessmentSessions(db.assessmentSessions ?? {});
        saveDb();
        return json(res, 200, db.assessmentSessions);
      }

      if (path === "/api/assessments/sessions" && method === "PUT") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const nextSessions = (await readBody(req)) as
          | Record<string, AssessmentSession>
          | null;
        db.assessmentSessions = pruneAssessmentSessions(nextSessions ?? {});
        saveDb();
        return json(res, 200, db.assessmentSessions);
      }

      // ================= COURSES =================
      if (path === "/api/courses" && method === "GET") {
        return json(res, 200, db.courses);
      }

      if (path === "/api/courses" && method === "POST") {
        const course = await readBody(req);
        const idempotency = resolveIdempotencyRequest(
          db,
          req,
          path,
          method,
          course
        );
        if (idempotency.mode === "replay") {
          return json(res, idempotency.statusCode, idempotency.response);
        }
        if (idempotency.mode === "conflict") {
          return json(res, 409, {
            error:
              "Idempotency ключ уже использован с другим payload. Сгенерируйте новый запрос.",
            code: "idempotency_conflict",
          });
        }
        const existingCourseIndex = db.courses.findIndex((item) => item.id === course.id);
        if (existingCourseIndex >= 0) {
          db.courses[existingCourseIndex] = course;
        } else {
          db.courses.push(course);
        }
        registerIdempotencyResponse(
          db,
          idempotency.mode === "new" ? idempotency.record : null,
          200,
          course
        );
        saveDb();
        return json(res, 200, course);
      }

      const courseMatch = path.match(/^\/api\/courses\/([^/]+)$/);
      if (courseMatch) {
        const id = decodeURIComponent(courseMatch[1]);
        if (method === "GET") {
          const course = db.courses.find((c) => c.id === id) ?? null;
          return json(res, 200, course);
        }
        if (method === "PUT") {
          const course = await readBody(req);
          const idempotency = resolveIdempotencyRequest(
            db,
            req,
            path,
            method,
            course
          );
          if (idempotency.mode === "replay") {
            return json(res, idempotency.statusCode, idempotency.response);
          }
          if (idempotency.mode === "conflict") {
            return json(res, 409, {
              error:
                "Idempotency ключ уже использован с другим payload. Сгенерируйте новый запрос.",
              code: "idempotency_conflict",
            });
          }
          const nextCourse = course as Course;
          db.courses = db.courses.map((c) => (c.id === id ? nextCourse : c));
          if (nextCourse.status === "published") {
            const lessonsSnapshot = db.lessons
              .filter((lesson) => lesson.courseId === id)
              .sort((a, b) => a.order - b.order);
            const purchasedTestItemIds = getPurchasedTestItemIdsForCourse(db, id);
            db.purchases = db.purchases.map((purchase) => {
              if (purchase.courseId !== id) return purchase;
              return {
                ...purchase,
                courseSnapshot: JSON.parse(JSON.stringify(nextCourse)),
                lessonsSnapshot: JSON.parse(JSON.stringify(lessonsSnapshot)),
                purchasedTestItemIds,
              };
            });
          }
          registerIdempotencyResponse(
            db,
            idempotency.mode === "new" ? idempotency.record : null,
            200,
            nextCourse
          );
          saveDb();
          return json(res, 200, nextCourse);
        }
        if (method === "DELETE") {
          db.courses = db.courses.filter((c) => c.id !== id);
          saveDb();
          return json(res, 200, { ok: true });
        }
      }

      // ================= LESSONS =================
      if (path === "/api/lessons" && method === "GET") {
        const courseId = url.searchParams.get("courseId");
        const lessons = courseId
          ? db.lessons.filter((l) => l.courseId === courseId)
          : db.lessons;
        const sorted = [...lessons].sort((a, b) => a.order - b.order);
        return json(res, 200, sorted);
      }

      if (path === "/api/lessons" && method === "POST") {
        const lesson = await readBody(req);
        const idempotency = resolveIdempotencyRequest(
          db,
          req,
          path,
          method,
          lesson
        );
        if (idempotency.mode === "replay") {
          return json(res, idempotency.statusCode, idempotency.response);
        }
        if (idempotency.mode === "conflict") {
          return json(res, 409, {
            error:
              "Idempotency ключ уже использован с другим payload. Сгенерируйте новый запрос.",
            code: "idempotency_conflict",
          });
        }
        db.lessons.push(lesson);
        registerIdempotencyResponse(
          db,
          idempotency.mode === "new" ? idempotency.record : null,
          200,
          lesson
        );
        saveDb();
        return json(res, 200, lesson);
      }

      if (path === "/api/lessons" && method === "PUT") {
        const courseId = url.searchParams.get("courseId");
        const lessons = (await readBody(req)) as Lesson[];
        const idempotency = resolveIdempotencyRequest(
          db,
          req,
          path,
          method,
          {
            courseId,
            lessons,
          }
        );
        if (idempotency.mode === "replay") {
          return json(res, idempotency.statusCode, idempotency.response);
        }
        if (idempotency.mode === "conflict") {
          return json(res, 409, {
            error:
              "Idempotency ключ уже использован с другим payload. Сгенерируйте новый запрос.",
            code: "idempotency_conflict",
          });
        }
        if (!courseId) {
          return json(res, 400, { error: "courseId is required" });
        }
        db.lessons = [
          ...db.lessons.filter((l) => l.courseId !== courseId),
          ...lessons,
        ];
        registerIdempotencyResponse(
          db,
          idempotency.mode === "new" ? idempotency.record : null,
          200,
          { ok: true }
        );
        saveDb();
        return json(res, 200, { ok: true });
      }

      if (path === "/api/lessons" && method === "DELETE") {
        const courseId = url.searchParams.get("courseId");
        if (!courseId) {
          return json(res, 400, { error: "courseId is required" });
        }
        db.lessons = db.lessons.filter((l) => l.courseId !== courseId);
        saveDb();
        return json(res, 200, { ok: true });
      }

      const lessonMatch = path.match(/^\/api\/lessons\/([^/]+)$/);
      if (lessonMatch && method === "GET") {
        const id = decodeURIComponent(lessonMatch[1]);
        const lesson = db.lessons.find((l) => l.id === id) ?? null;
        return json(res, 200, lesson);
      }

      // ================= PURCHASES =================
      if (path === "/api/purchases" && method === "GET") {
        const requestedUserId = decodeURIComponent(
          url.searchParams.get("userId") ?? ""
        );
        if (!actorUser && requestedUserId) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        if (
          actorUser &&
          actorUser.role !== "teacher" &&
          requestedUserId &&
          requestedUserId !== actorUser.id
        ) {
          return json(res, 403, { error: "Недопустимый контекст покупок." });
        }
        const userId = actorUser
          ? actorUser.role === "teacher"
            ? requestedUserId
            : actorUser.id
          : "";
        let mutated = false;
        db.purchases = db.purchases.map((purchase) => {
          const hasCourseSnapshot = Boolean(purchase.courseSnapshot);
          const hasLessonsSnapshot = Array.isArray(purchase.lessonsSnapshot);
          const linkedCheckout =
            (typeof purchase.checkoutId === "string" &&
            purchase.checkoutId.trim().length > 0
              ? db.checkoutProcesses.find(
                  (item) => item.id === purchase.checkoutId
                ) ?? null
              : null) ??
            db.checkoutProcesses
              .filter(
                (item) =>
                  item.userId === purchase.userId &&
                  item.courseId === purchase.courseId &&
                  isPositiveCheckoutState(item.state)
              )
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
            null;
          const normalizedPaymentMethod = isPurchasePaymentMethod(
            (purchase as { paymentMethod?: unknown }).paymentMethod
          )
            ? (purchase as { paymentMethod: PurchasePaymentMethod }).paymentMethod
            : linkedCheckout?.method ?? "unknown";
          const shouldHaveBnpl = normalizedPaymentMethod === "bnpl";
          const normalizedBnpl =
            shouldHaveBnpl
              ? normalizeBnplData(
                  (purchase as { bnpl?: unknown }).bnpl,
                  purchase.price ?? 0,
                  purchase.purchasedAt,
                  linkedCheckout?.bnplInstallmentsCount
                )
              : undefined;

          const courseSnapshot =
            purchase.courseSnapshot ??
            db.courses.find((course) => course.id === purchase.courseId);
          const lessonsSnapshot = hasLessonsSnapshot
            ? purchase.lessonsSnapshot
            : db.lessons
                .filter((lesson) => lesson.courseId === purchase.courseId)
                .sort((a, b) => a.order - b.order);
          const nextPurchase = {
            ...purchase,
            paymentMethod: normalizedPaymentMethod,
            checkoutId: purchase.checkoutId ?? linkedCheckout?.id,
            bnpl: normalizedBnpl,
            courseSnapshot: courseSnapshot
              ? JSON.parse(JSON.stringify(courseSnapshot))
              : undefined,
            lessonsSnapshot: JSON.parse(JSON.stringify(lessonsSnapshot)),
          };
          if (!hasCourseSnapshot || !hasLessonsSnapshot) {
            mutated = true;
            return nextPurchase;
          }
          if (
            purchase.paymentMethod !== nextPurchase.paymentMethod ||
            purchase.checkoutId !== nextPurchase.checkoutId ||
            (shouldHaveBnpl && !purchase.bnpl) ||
            (!shouldHaveBnpl && Boolean(purchase.bnpl))
          ) {
            mutated = true;
            return nextPurchase;
          }
          return purchase;
        });
        if (mutated) saveDb();
        if (userId) {
          const user = db.users.find((candidate) => candidate.id === userId) ?? null;
          if (user) {
            const repaired = ensureUserCourseArtifacts(
              db,
              {
                userId: user.id,
                email: user.email,
              },
              nowIso()
            );
            if (repaired) {
              saveDb();
            }
          }
          const verified = isIdentityVerified(db, { userId });
          if (!verified) {
            return json(res, 200, []);
          }
          const allowed = db.purchases.filter(
            (purchase) =>
              purchase.userId === userId &&
              hasActiveCourseEntitlement(db, userId, purchase.courseId)
          );
          return json(res, 200, allowed);
        }
        if (!actorUser) {
          return json(res, 200, []);
        }
        return json(res, 200, actorUser.role === "teacher" ? db.purchases : []);
      }

      if (path === "/api/purchases" && method === "PUT") {
        const purchases = await readBody(req);
        db.purchases = purchases ?? [];
        saveDb();
        return json(res, 200, { ok: true });
      }

      if (path === "/api/purchases/checkout" && method === "POST") {
        const body = (await readBody(req)) as {
          userId?: string;
          email?: string;
          firstName: string;
          lastName: string;
          phone: string;
          courseId: string;
          price: number;
          paymentMethod?: CheckoutMethod;
          bnplInstallmentsCount?: number;
          consents?: {
            acceptedScopes?: unknown;
          };
        };
        const idempotency = resolveIdempotencyRequest(
          db,
          req,
          path,
          method,
          body
        );
        if (idempotency.mode === "replay") {
          return json(res, idempotency.statusCode, idempotency.response);
        }
        if (idempotency.mode === "conflict") {
          return json(res, 409, {
            error:
              "Idempotency ключ уже использован с другим payload. Сгенерируйте новый запрос.",
            code: "idempotency_conflict",
          });
        }

        const timestamp = nowIso();
        const normalizedBnplInstallmentsCount =
          normalizeCheckoutMethod(body.paymentMethod) === "bnpl"
            ? toValidInstallmentsCount(body.bnplInstallmentsCount)
            : undefined;
        if (actorUser?.role === "teacher") {
          return json(res, 409, {
            error:
              "Вы преподаватель и уже владеете всеми курсами. Покупка не требуется.",
          });
        }
        let email = normalizeEmail(body?.email);
        if (actorUser) {
          if (body.userId && body.userId !== actorUser.id) {
            return json(res, 409, {
              error:
                "Checkout должен выполняться только для авторизованного аккаунта.",
            });
          }
          if (email && email !== normalizeEmail(actorUser.email)) {
            return json(res, 409, {
              error:
                "Email checkout не совпадает с авторизованным аккаунтом.",
            });
          }
          body.userId = actorUser.id;
          body.email = actorUser.email;
          email = normalizeEmail(actorUser.email);
        }
        const normalizedCheckoutPhone = normalizePhoneStorage(body.phone);
        if (
          !body.courseId ||
          !body.firstName ||
          !body.lastName ||
          !normalizedCheckoutPhone
        ) {
          return json(res, 400, { error: "Данные не заполнены" });
        }

        if (email && teacherEmailSet.has(email)) {
          return json(res, 400, {
            error:
              "Этот email зарезервирован для кабинета преподавателя. Используйте email ученика.",
          });
        }

        if (!email) {
          return json(res, 400, { error: "Email обязателен" });
        }

        const userById = body.userId
          ? db.users.find((u) => u.id === body.userId) ?? null
          : null;
        const userByEmail = email
          ? db.users.find((u) => normalizeEmail(u.email) === email) ?? null
          : null;

        if (body.userId && !userById) {
          return json(res, 404, { error: "Пользователь не найден." });
        }

        if (
          userById &&
          email &&
          normalizeEmail(userById.email) !== email
        ) {
          return json(res, 409, {
            error:
              "Email не совпадает с текущим аккаунтом. Используйте email авторизованного пользователя.",
          });
        }

        if (!body.userId && userByEmail) {
          const conflictConsentCheck = ensureVersionedConsents(db, {
            email,
            userId: userByEmail.id,
            requiredScopes: ["terms", "privacy", "checkout"],
            acceptedScopes: body.consents?.acceptedScopes,
            capturedAt: timestamp,
          });
          if (!conflictConsentCheck.ok) {
            return json(
              res,
              conflictConsentCheck.status,
              conflictConsentCheck.body
            );
          }

          const normalizedMethod = normalizeCheckoutMethod(body.paymentMethod);
          const checkoutKeyBase = `${normalizeEmail(email)}:${body.courseId}#attach`;
          const relatedConflictCheckouts = db.checkoutProcesses
            .filter(
              (item) =>
                item.idempotencyKey.startsWith(checkoutKeyBase) && !item.userId
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          const existingConflictCheckout = relatedConflictCheckouts.find(
            (item) =>
              item.state === "created" ||
              item.state === "awaiting_payment" ||
              item.state === "paid" ||
              item.state === "provisioning" ||
              item.state === "provisioned"
          );
          const conflictCheckout =
            existingConflictCheckout ??
            ({
              id: ensureId(),
              idempotencyKey: checkoutKeyBase,
              email,
              courseId: body.courseId,
              amount: body.price ?? 0,
              currency: "RUB",
              method: normalizedMethod,
              bnplInstallmentsCount: normalizedBnplInstallmentsCount,
              state: "created",
              createdAt: timestamp,
              updatedAt: timestamp,
              expiresAt: checkoutExpiresAt(timestamp),
            } satisfies CheckoutProcess);
          if (!existingConflictCheckout) {
            db.checkoutProcesses.push(conflictCheckout);
          } else {
            conflictCheckout.amount = body.price ?? conflictCheckout.amount;
            conflictCheckout.method = normalizedMethod;
            conflictCheckout.bnplInstallmentsCount =
              normalizedMethod === "bnpl"
                ? normalizedBnplInstallmentsCount
                : undefined;
            conflictCheckout.updatedAt = timestamp;
            if (
              conflictCheckout.state === "created" ||
              conflictCheckout.state === "awaiting_payment"
            ) {
              conflictCheckout.expiresAt = checkoutExpiresAt(timestamp);
            }
          }
          saveDb();
          return json(res, 409, {
            error:
              "Пользователь с этим email уже существует. Авторизуйтесь, чтобы привязать покупку к существующему аккаунту.",
            code: "identity_conflict_auth_required",
            checkoutId: conflictCheckout.id,
            nextAction: "login_and_attach",
          });
        }

        const user = userById ?? userByEmail;

        const consentCheck = ensureVersionedConsents(db, {
          email,
          userId: user?.id,
          requiredScopes: ["terms", "privacy", "checkout"],
          acceptedScopes: body.consents?.acceptedScopes,
          capturedAt: timestamp,
        });
        if (!consentCheck.ok) {
          return json(res, consentCheck.status, consentCheck.body);
        }

        if (!user) {
          upsertIdentityRecord(
            db,
            {
              email,
              state: "known_unverified",
            },
            timestamp
          );
        } else {
          if (user.role === "teacher") {
            return json(res, 400, {
              error:
                "Этот email принадлежит преподавателю. Используйте email ученика.",
            });
          }
          user.firstName = body.firstName;
          user.lastName = body.lastName;
          user.phone = normalizedCheckoutPhone;
          upsertIdentityRecord(db, {
            email: user.email,
            userId: user.id,
            state: getNextIdentityStateForUser(db, {
              email: user.email,
              userId: user.id,
            }),
          }, timestamp);
        }

        const checkoutOwnerEmail = user?.email ?? email;
        const checkoutOwnerUserId = user?.id;
        const normalizedMethod = normalizeCheckoutMethod(body.paymentMethod);
        const checkoutKeyBase = `${normalizeEmail(checkoutOwnerEmail)}:${body.courseId}`;
        const relatedCheckouts = db.checkoutProcesses
          .filter((item) => item.idempotencyKey.startsWith(checkoutKeyBase))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const existingActiveCheckout = relatedCheckouts.find(
          (item) =>
            item.state === "created" ||
            item.state === "awaiting_payment" ||
            item.state === "paid" ||
            item.state === "provisioning" ||
            item.state === "provisioned"
        );
        let checkout = existingActiveCheckout;

        if (!checkout) {
          const retryIndex = relatedCheckouts.length + 1;
          const retrySuffix = retryIndex > 1 ? `#retry:${retryIndex}` : "";
          checkout = {
            id: ensureId(),
            idempotencyKey: `${checkoutKeyBase}${retrySuffix}`,
            userId: checkoutOwnerUserId,
            email: checkoutOwnerEmail,
            profileDraft: {
              firstName: body.firstName,
              lastName: body.lastName,
              phone: normalizedCheckoutPhone,
            },
            courseId: body.courseId,
            amount: body.price ?? 0,
            currency: "RUB",
            method: normalizedMethod,
            bnplInstallmentsCount:
              normalizedMethod === "bnpl"
                ? normalizedBnplInstallmentsCount
                : undefined,
            state: "created",
            createdAt: timestamp,
            updatedAt: timestamp,
            expiresAt: checkoutExpiresAt(timestamp),
          };
          db.checkoutProcesses.push(checkout);
        } else {
          checkout.userId = checkoutOwnerUserId;
          checkout.email = checkoutOwnerEmail;
          checkout.profileDraft = {
            firstName: body.firstName,
            lastName: body.lastName,
            phone: normalizedCheckoutPhone,
          };
          checkout.amount = body.price ?? checkout.amount;
          checkout.method = normalizedMethod;
          checkout.bnplInstallmentsCount =
            normalizedMethod === "bnpl"
              ? normalizedBnplInstallmentsCount
              : undefined;
          checkout.updatedAt = timestamp;
          if (
            checkout.state === "created" ||
            checkout.state === "awaiting_payment"
          ) {
            checkout.expiresAt = checkoutExpiresAt(timestamp);
          }
        }

        const paymentDecision = initiateCheckoutPayment({
          checkoutId: checkout.id,
          amount: body.price ?? 0,
          currency: "RUB",
          method: normalizedMethod,
          courseId: body.courseId,
          userId: checkoutOwnerUserId,
          email: checkoutOwnerEmail,
          requestedAt: timestamp,
        });
        processPaymentEvent(db, {
          provider: paymentDecision.provider,
          externalEventId: paymentDecision.externalEventId,
          checkoutId: checkout.id,
          status: paymentDecision.status,
          payload: paymentDecision.payload,
          processedAt: timestamp,
        });
        maybeAutoCaptureCardCheckout(db, checkout, paymentDecision, timestamp);
        ensureCheckoutProvisioned(db, checkout, timestamp);
        captureConsent(
          db,
          {
            email: checkoutOwnerEmail,
            userId: checkoutOwnerUserId,
            scope: "checkout",
          },
          timestamp
        );
        queueCheckoutTransactionalEmail(db, checkout, timestamp);
        await dispatchOutboxQueue(db, timestamp);

        const checkoutAccess = checkoutOwnerUserId
          ? getCheckoutAccessPayload(db, {
              userId: checkoutOwnerUserId,
              email: checkoutOwnerEmail,
              courseId: body.courseId,
            })
          : {
              identityState: getIdentityRecord(db, {
                email: checkoutOwnerEmail,
              })?.state ?? "anonymous",
              entitlementState: "none" as const,
              profileComplete: false,
              accessState:
                paymentDecision.status === "paid"
                  ? ("awaiting_profile" as const)
                  : ("paid_but_restricted" as const),
            };

        const checkoutResponse = {
          user: user ? safeUser(user) : undefined,
          checkoutId: checkout.id,
          checkoutState: checkout.state,
          payment: getCheckoutPaymentPayload(paymentDecision),
          ...checkoutAccess,
        };
        registerIdempotencyResponse(
          db,
          idempotency.mode === "new" ? idempotency.record : null,
          200,
          checkoutResponse
        );
        saveDb();
        return json(res, 200, checkoutResponse);
      }

      if (path === "/api/purchases/checkout/attach" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        if (actorUser.role === "teacher") {
          return json(res, 409, {
            error:
              "Вы преподаватель и уже владеете всеми курсами. Покупка не требуется.",
          });
        }
        const body = (await readBody(req)) as { checkoutId?: string };
        const checkoutId =
          typeof body?.checkoutId === "string" ? body.checkoutId.trim() : "";
        if (!checkoutId) {
          return json(res, 400, { error: "checkoutId обязателен." });
        }

        const checkout =
          db.checkoutProcesses.find((item) => item.id === checkoutId) ?? null;
        if (!checkout) {
          return json(res, 404, { error: "Checkout не найден." });
        }
        if (normalizeEmail(checkout.email) !== normalizeEmail(actorUser.email)) {
          return json(res, 403, {
            error:
              "Этот checkout привязан к другому email. Выполните вход под корректным аккаунтом.",
          });
        }
        if (checkout.userId && checkout.userId !== actorUser.id) {
          return json(res, 403, {
            error:
              "Checkout уже привязан к другому аккаунту и не может быть прикреплён повторно.",
          });
        }
        if (
          checkout.state === "failed" ||
          checkout.state === "canceled" ||
          checkout.state === "expired"
        ) {
          return json(res, 409, {
            error:
              "Этот checkout больше неактивен. Создайте новую попытку покупки.",
          });
        }

        const timestamp = nowIso();
        checkout.userId = actorUser.id;
        checkout.email = actorUser.email;
        checkout.updatedAt = timestamp;
        checkout.method = normalizeCheckoutMethod(checkout.method);
        if (
          checkout.state === "created" ||
          checkout.state === "awaiting_payment"
        ) {
          checkout.expiresAt = checkoutExpiresAt(timestamp);
        }

        const paymentDecision = initiateCheckoutPayment({
          checkoutId: checkout.id,
          amount: checkout.amount,
          currency: checkout.currency,
          method: checkout.method,
          courseId: checkout.courseId,
          userId: actorUser.id,
          email: actorUser.email,
          requestedAt: timestamp,
        });
        processPaymentEvent(db, {
          provider: paymentDecision.provider,
          externalEventId: paymentDecision.externalEventId,
          checkoutId: checkout.id,
          status: paymentDecision.status,
          payload: {
            ...(paymentDecision.payload ?? {}),
            source: "checkout-attach",
          },
          processedAt: timestamp,
        });
        maybeAutoCaptureCardCheckout(db, checkout, paymentDecision, timestamp);
        ensureCheckoutProvisioned(db, checkout, timestamp);
        captureConsent(
          db,
          {
            email: actorUser.email,
            userId: actorUser.id,
            scope: "checkout",
          },
          timestamp
        );
        queueCheckoutTransactionalEmail(db, checkout, timestamp);
        await dispatchOutboxQueue(db, timestamp);
        const checkoutAccess = getCheckoutAccessPayload(db, {
          userId: actorUser.id,
          email: actorUser.email,
          courseId: checkout.courseId,
        });
        saveDb();
        return json(res, 200, {
          user: safeUser(actorUser),
          checkoutId: checkout.id,
          checkoutState: checkout.state,
          payment: getCheckoutPaymentPayload(paymentDecision),
          ...checkoutAccess,
        });
      }

      const purchaseBnplPayInstallmentMatch = path.match(
        /^\/api\/purchases\/([^/]+)\/bnpl\/pay-installment$/
      );
      const purchaseBnplPayRemainingMatch = path.match(
        /^\/api\/purchases\/([^/]+)\/bnpl\/pay-remaining$/
      );
      const purchaseBnplPayMatch =
        purchaseBnplPayInstallmentMatch ?? purchaseBnplPayRemainingMatch;
      const bnplPaymentMode = purchaseBnplPayInstallmentMatch
        ? "installment"
        : purchaseBnplPayRemainingMatch
          ? "remaining"
          : null;

      if (purchaseBnplPayMatch && bnplPaymentMode && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const purchaseId = decodeURIComponent(purchaseBnplPayMatch[1]);
        const purchase =
          db.purchases.find((item) => item.id === purchaseId) ?? null;
        if (!purchase) {
          return json(res, 404, { error: "Покупка не найдена." });
        }
        if (actorUser.role !== "teacher" && purchase.userId !== actorUser.id) {
          return json(res, 403, { error: "Недопустимый контекст покупки." });
        }
        if ((purchase.paymentMethod ?? "unknown") !== "bnpl") {
          return json(res, 409, {
            error: "Для этой покупки не настроен график оплаты частями.",
          });
        }
        const owner =
          db.users.find((item) => item.id === purchase.userId) ?? null;
        if (!owner) {
          return json(res, 409, {
            error: "Невозможно провести оплату: владелец покупки не найден.",
          });
        }

        const timestamp = nowIso();
        let checkout =
          (typeof purchase.checkoutId === "string" && purchase.checkoutId.trim()
            ? db.checkoutProcesses.find((item) => item.id === purchase.checkoutId) ??
              null
            : null) ??
          db.checkoutProcesses
            .filter(
              (item) =>
                item.userId === purchase.userId &&
                item.courseId === purchase.courseId &&
                item.method === "bnpl"
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
          null;

        if (!checkout) {
          checkout = {
            id: ensureId(),
            idempotencyKey: `legacy-bnpl:${purchase.userId}:${purchase.courseId}:${timestamp}`,
            userId: purchase.userId,
            email: owner.email,
            courseId: purchase.courseId,
            amount: purchase.price,
            currency: "RUB",
            method: "bnpl",
            bnplInstallmentsCount:
              normalizeBnplData(
                purchase.bnpl,
                purchase.price,
                purchase.purchasedAt,
                undefined
              ).plan?.installmentsCount ?? 4,
            state: "provisioned",
            createdAt: purchase.purchasedAt,
            updatedAt: timestamp,
            expiresAt: checkoutExpiresAt(timestamp),
          };
          db.checkoutProcesses.push(checkout);
        }

        if (checkout.method !== "bnpl") {
          return json(res, 409, {
            error:
              "Связанный checkout не поддерживает оплату частями. Обратитесь в поддержку.",
          });
        }

        const body = (await readBody(req)) as {
          source?: unknown;
        } | null;
        const currentBnplPlan = normalizeBnplData(
          purchase.bnpl,
          purchase.price,
          purchase.purchasedAt,
          checkout.bnplInstallmentsCount
        ).plan;
        const fallbackBnplSnapshot = buildBnplPurchaseSnapshot({
          amount: purchase.price ?? checkout.amount ?? 0,
          purchasedAt: purchase.purchasedAt || checkout.createdAt,
          selectedInstallmentsCount:
            currentBnplPlan?.installmentsCount ?? checkout.bnplInstallmentsCount,
        });
        const fallbackPlan = fallbackBnplSnapshot.plan ?? {
          installmentsCount: fallbackBnplSnapshot.installmentsCount ?? 4,
          paidCount: fallbackBnplSnapshot.paidCount ?? 1,
          nextPaymentDate: fallbackBnplSnapshot.nextPaymentDate,
          schedule: fallbackBnplSnapshot.schedule ?? [],
        };
        const effectivePlan = currentBnplPlan ?? fallbackPlan;
        const effectiveSchedule = [...(effectivePlan.schedule ?? fallbackPlan.schedule ?? [])]
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const nextDueItem = effectiveSchedule.find((item) => item.status !== "paid") ?? null;
        const remainingAmount = effectiveSchedule
          .filter((item) => item.status !== "paid")
          .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
        const installmentsCount = Math.max(
          1,
          Math.floor(effectivePlan.installmentsCount || effectiveSchedule.length || 1)
        );
        const fallbackInstallmentAmount = Math.ceil(
          Math.max(0, Number(purchase.price ?? checkout.amount ?? 0)) / installmentsCount
        );

        if (bnplPaymentMode === "installment" && !nextDueItem) {
          const paymentProgress = {
            applied: false,
            installmentsCount,
            paidCount: Math.min(
              installmentsCount,
              Math.max(0, Math.floor(effectivePlan.paidCount || installmentsCount))
            ),
            nextPaymentDate: undefined,
            completed: true,
          };
          saveDb();
          return json(res, 200, {
            ok: true,
            purchaseId: purchase.id,
            checkoutId: checkout.id,
            checkoutState: checkout.state,
            payment: getCheckoutPaymentStatusPayload(db, checkout),
            bnpl: paymentProgress,
            purchase,
          });
        }

        if (bnplPaymentMode === "remaining" && remainingAmount <= 0) {
          const paymentProgress = {
            applied: false,
            installmentsCount,
            paidCount: installmentsCount,
            nextPaymentDate: undefined,
            completed: true,
          };
          saveDb();
          return json(res, 200, {
            ok: true,
            purchaseId: purchase.id,
            checkoutId: checkout.id,
            checkoutState: checkout.state,
            payment: getCheckoutPaymentStatusPayload(db, checkout),
            bnpl: paymentProgress,
            purchase,
          });
        }

        const paymentAmount =
          bnplPaymentMode === "remaining"
            ? Math.max(1, remainingAmount)
            : Math.max(1, nextDueItem?.amount ?? fallbackInstallmentAmount);

        const paymentDecision = initiateCheckoutPayment({
          checkoutId: checkout.id,
          amount: paymentAmount,
          currency: checkout.currency,
          method: "bnpl",
          courseId: checkout.courseId,
          userId: checkout.userId,
          email: checkout.email,
          requestedAt: timestamp,
        });
        const sourceTag =
          body && typeof body.source === "string" && body.source.trim()
            ? body.source.trim()
            : bnplPaymentMode === "remaining"
              ? "manual_full_repayment"
              : "manual_installment_payment";
        processPaymentEvent(db, {
          provider: paymentDecision.provider,
          externalEventId: `${paymentDecision.externalEventId}:${bnplPaymentMode}:${timestamp}`,
          checkoutId: checkout.id,
          status: paymentDecision.status,
          payload: {
            ...(paymentDecision.payload ?? {}),
            source: sourceTag,
            installmentIntent: bnplPaymentMode === "installment",
            fullRepaymentIntent: bnplPaymentMode === "remaining",
          },
          processedAt: timestamp,
        });
        ensureCheckoutProvisioned(db, checkout, timestamp);
        const paymentProgress =
          paymentDecision.status === "paid"
            ? bnplPaymentMode === "remaining"
              ? applyBnplRemainingPayment(purchase, checkout, timestamp)
              : applyBnplInstallmentPayment(purchase, checkout, timestamp)
            : {
                applied: false,
                installmentsCount,
                paidCount: Math.min(
                  installmentsCount,
                  Math.max(0, Math.floor(effectivePlan.paidCount || 0))
                ),
                nextPaymentDate: effectivePlan.nextPaymentDate,
                completed: bnplPaymentMode === "remaining" ? remainingAmount <= 0 : false,
              };

        saveDb();
        return json(res, 200, {
          ok: true,
          purchaseId: purchase.id,
          checkoutId: checkout.id,
          checkoutState: checkout.state,
          payment: getCheckoutPaymentStatusPayload(db, checkout),
          bnpl: paymentProgress,
          purchase,
        });
      }

      if (path === "/api/checkouts" && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const requestedUserId = decodeURIComponent(
          url.searchParams.get("userId") ?? ""
        );
        const requestedEmail = normalizeEmail(url.searchParams.get("email"));
        if (
          actorUser.role !== "teacher" &&
          requestedUserId &&
          requestedUserId !== actorUser.id
        ) {
          return json(res, 403, { error: "Недопустимый контекст checkout." });
        }
        if (
          actorUser.role !== "teacher" &&
          requestedEmail &&
          requestedEmail !== normalizeEmail(actorUser.email)
        ) {
          return json(res, 403, { error: "Недопустимый email checkout." });
        }
        const userId =
          actorUser.role === "teacher"
            ? requestedUserId
            : actorUser.id;
        const email =
          actorUser.role === "teacher"
            ? requestedEmail
            : normalizeEmail(actorUser.email);
        const courseId = decodeURIComponent(url.searchParams.get("courseId") ?? "");
        let processes = db.checkoutProcesses;
        if (userId) {
          processes = processes.filter((process) => process.userId === userId);
        }
        if (email) {
          processes = processes.filter(
            (process) => normalizeEmail(process.email) === email
          );
        }
        if (courseId) {
          processes = processes.filter((process) => process.courseId === courseId);
        }
        const statusTimestamp = nowIso();
        processes.forEach((process) => {
          maybeSettleAwaitingCheckout(db, process, statusTimestamp);
        });
        return json(
          res,
          200,
          [...processes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        );
      }

      const checkoutMatch = path.match(/^\/api\/checkouts\/([^/]+)$/);
      if (checkoutMatch && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const checkoutId = decodeURIComponent(checkoutMatch[1]);
        const checkout =
          db.checkoutProcesses.find((item) => item.id === checkoutId) ?? null;
        if (
          checkout &&
          actorUser.role !== "teacher" &&
          checkout.userId !== actorUser.id
        ) {
          return json(res, 403, { error: "Недопустимый checkout." });
        }
        return json(res, 200, checkout);
      }

      const checkoutStatusMatch = path.match(/^\/api\/checkouts\/([^/]+)\/status$/);
      if (checkoutStatusMatch && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const checkoutId = decodeURIComponent(checkoutStatusMatch[1]);
        const checkout =
          db.checkoutProcesses.find((item) => item.id === checkoutId) ?? null;
        if (!checkout) {
          return json(res, 404, { error: "Checkout не найден." });
        }
        const isOwnerByUserId =
          Boolean(checkout.userId) && checkout.userId === actorUser.id;
        const isOwnerByEmail =
          !checkout.userId &&
          normalizeEmail(checkout.email) === normalizeEmail(actorUser.email);
        if (actorUser.role !== "teacher" && !isOwnerByUserId && !isOwnerByEmail) {
          return json(res, 403, { error: "Недопустимый checkout." });
        }
        maybeSettleAwaitingCheckout(db, checkout, nowIso());

        const access =
          checkout.userId && checkout.email
            ? getCheckoutAccessPayload(db, {
                userId: checkout.userId,
                email: checkout.email,
                courseId: checkout.courseId,
              })
            : null;
        const payment = getCheckoutPaymentStatusPayload(db, checkout);
        return json(res, 200, {
          checkoutId: checkout.id,
          state: checkout.state,
          method: checkout.method,
          bnplInstallmentsCount: checkout.bnplInstallmentsCount,
          amount: checkout.amount,
          currency: checkout.currency,
          createdAt: checkout.createdAt,
          updatedAt: checkout.updatedAt,
          expiresAt: checkout.expiresAt ?? null,
          isTerminal:
            checkout.state === "failed" ||
            checkout.state === "canceled" ||
            checkout.state === "expired" ||
            checkout.state === "provisioned",
          payment,
          access,
        });
      }

      const checkoutRetryMatch = path.match(/^\/api\/checkouts\/([^/]+)\/retry$/);
      if (checkoutRetryMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const checkoutId = decodeURIComponent(checkoutRetryMatch[1]);
        const checkout =
          db.checkoutProcesses.find((item) => item.id === checkoutId) ?? null;
        if (!checkout) {
          return json(res, 404, { error: "Checkout не найден." });
        }
        const isOwnerByUserId =
          Boolean(checkout.userId) && checkout.userId === actorUser.id;
        const isOwnerByEmail =
          !checkout.userId &&
          normalizeEmail(checkout.email) === normalizeEmail(actorUser.email);
        if (actorUser.role !== "teacher" && !isOwnerByUserId && !isOwnerByEmail) {
          return json(res, 403, { error: "Недопустимый checkout." });
        }
        if (
          checkout.state === "paid" ||
          checkout.state === "provisioning" ||
          checkout.state === "provisioned"
        ) {
          return json(res, 409, {
            error: "Checkout уже оплачен или выдан в доступ. Retry не требуется.",
          });
        }

        const timestamp = nowIso();
        if (!checkout.userId && actorUser.role !== "teacher") {
          checkout.userId = actorUser.id;
          checkout.email = actorUser.email;
        }
        checkout.method = normalizeCheckoutMethod(checkout.method);
        checkout.updatedAt = timestamp;
        checkout.expiresAt = checkoutExpiresAt(timestamp);

        const provider = resolveCheckoutProvider(db, checkout);
        processPaymentEvent(db, {
          provider,
          externalEventId: `checkout:retry:${checkout.id}:${timestamp}`,
          checkoutId: checkout.id,
          status: "awaiting_payment",
          payload: {
            source: "checkout_retry",
            actorUserId: actorUser.id,
            actorRole: actorUser.role,
          },
          processedAt: timestamp,
        });

        const paymentDecision = initiateCheckoutPayment({
          checkoutId: checkout.id,
          amount: checkout.amount,
          currency: checkout.currency,
          method: checkout.method,
          courseId: checkout.courseId,
          userId: checkout.userId,
          email: checkout.email,
          requestedAt: timestamp,
        });
        processPaymentEvent(db, {
          provider: paymentDecision.provider,
          externalEventId: `${paymentDecision.externalEventId}:retry:${timestamp}`,
          checkoutId: checkout.id,
          status: paymentDecision.status,
          payload: {
            ...(paymentDecision.payload ?? {}),
            source: "checkout_retry_initiate",
          },
          processedAt: timestamp,
        });
        maybeAutoCaptureCardCheckout(db, checkout, paymentDecision, timestamp);
        ensureCheckoutProvisioned(db, checkout, timestamp);
        if (checkout.userId) {
          queueCheckoutTransactionalEmail(db, checkout, timestamp);
        }
        await dispatchOutboxQueue(db, timestamp);
        saveDb();
        return json(res, 200, {
          ok: true,
          checkoutId: checkout.id,
          checkoutState: checkout.state,
          payment: getCheckoutPaymentStatusPayload(db, checkout),
          access:
            checkout.userId && checkout.email
              ? getCheckoutAccessPayload(db, {
                  userId: checkout.userId,
                  email: checkout.email,
                  courseId: checkout.courseId,
                })
              : null,
        });
      }

      const checkoutConfirmPaidMatch = path.match(
        /^\/api\/checkouts\/([^/]+)\/confirm-paid$/
      );
      if (checkoutConfirmPaidMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const checkoutId = decodeURIComponent(checkoutConfirmPaidMatch[1]);
        const checkout =
          db.checkoutProcesses.find((item) => item.id === checkoutId) ?? null;
        if (!checkout) {
          return json(res, 404, { error: "Checkout не найден." });
        }
        const isOwnerByUserId =
          Boolean(checkout.userId) && checkout.userId === actorUser.id;
        const isOwnerByEmail =
          !checkout.userId &&
          normalizeEmail(checkout.email) === normalizeEmail(actorUser.email);
        if (actorUser.role !== "teacher" && !isOwnerByUserId && !isOwnerByEmail) {
          return json(res, 403, { error: "Недопустимый checkout." });
        }
        if (
          checkout.state === "failed" ||
          checkout.state === "canceled" ||
          checkout.state === "expired"
        ) {
          return json(res, 409, {
            error: "Попытка оплаты завершена ошибкой. Используйте повтор платежа.",
          });
        }

        const processedAt = nowIso();
        processPaymentEvent(db, {
          provider: resolveCheckoutProvider(db, checkout),
          externalEventId: `checkout:manual-confirm:${checkout.id}:${processedAt}`,
          checkoutId: checkout.id,
          status: "paid",
          payload: {
            source: "manual_confirm_paid",
            actorUserId: actorUser.id,
          },
          processedAt,
        });
        ensureCheckoutProvisioned(db, checkout, processedAt);
        if (checkout.userId) {
          queueCheckoutTransactionalEmail(db, checkout, processedAt);
        }
        await dispatchOutboxQueue(db, processedAt);
        saveDb();
        return json(res, 200, {
          ok: true,
          checkoutId: checkout.id,
          checkoutState: checkout.state,
          payment: getCheckoutPaymentStatusPayload(db, checkout),
          access:
            checkout.userId && checkout.email
              ? getCheckoutAccessPayload(db, {
                  userId: checkout.userId,
                  email: checkout.email,
                  courseId: checkout.courseId,
                })
              : null,
        });
      }

      const checkoutTimelineMatch = path.match(
        /^\/api\/checkouts\/([^/]+)\/timeline$/
      );
      if (checkoutTimelineMatch && method === "GET") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const checkoutId = decodeURIComponent(checkoutTimelineMatch[1]);
        const checkout =
          db.checkoutProcesses.find((item) => item.id === checkoutId) ?? null;
        if (!checkout) {
          return json(res, 404, { error: "Checkout не найден." });
        }
        const isOwnerByUserId =
          Boolean(checkout.userId) && checkout.userId === actorUser.id;
        const isOwnerByEmail =
          !checkout.userId &&
          normalizeEmail(checkout.email) === normalizeEmail(actorUser.email);
        if (actorUser.role !== "teacher" && !isOwnerByUserId && !isOwnerByEmail) {
          return json(res, 403, { error: "Недопустимый checkout." });
        }

        const timeline = [
          {
            at: checkout.createdAt,
            type: "checkout_created",
            details: {
              state: checkout.state,
              method: checkout.method,
              amount: checkout.amount,
            },
          },
          ...db.paymentEvents
            .filter((event) => event.checkoutId === checkout.id)
            .map((event) => ({
              at: event.processedAt,
              type: "payment_event",
              details: {
                provider: event.provider,
                status: event.status,
                outcome: event.outcome,
                externalEventId: event.externalEventId,
              },
            })),
          ...db.supportActions
            .filter((action) => action.checkoutId === checkout.id)
            .map((action) => ({
              at: action.createdAt,
              type: "support_action",
              details: {
                action: action.type,
                issueCode: action.issueCode ?? null,
                notes: action.notes ?? null,
              },
            })),
          ...db.outbox
            .filter((item) => item.checkoutId === checkout.id)
            .map((item) => ({
              at: item.updatedAt,
              type: "notification",
              details: {
                template: item.template,
                status: item.status,
                recipientEmail: item.recipientEmail,
              },
            })),
        ].sort((a, b) => a.at.localeCompare(b.at));

        return json(res, 200, {
          checkoutId: checkout.id,
          state: checkout.state,
          timeline,
        });
      }

      const checkoutCancelMatch = path.match(/^\/api\/checkouts\/([^/]+)\/cancel$/);
      if (checkoutCancelMatch && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const checkoutId = decodeURIComponent(checkoutCancelMatch[1]);
        const checkout =
          db.checkoutProcesses.find((item) => item.id === checkoutId) ?? null;
        if (!checkout) {
          return json(res, 404, { error: "Checkout не найден." });
        }
        const isOwnerByUserId =
          Boolean(checkout.userId) && checkout.userId === actorUser.id;
        const isOwnerByEmail =
          !checkout.userId &&
          normalizeEmail(checkout.email) === normalizeEmail(actorUser.email);
        if (actorUser.role !== "teacher" && !isOwnerByUserId && !isOwnerByEmail) {
          return json(res, 403, { error: "Недопустимый checkout." });
        }

        if (
          checkout.state === "paid" ||
          checkout.state === "provisioning" ||
          checkout.state === "provisioned"
        ) {
          return json(res, 409, {
            error: "Оплаченный checkout нельзя отменить через этот сценарий.",
          });
        }

        if (
          checkout.state === "failed" ||
          checkout.state === "canceled" ||
          checkout.state === "expired"
        ) {
          return json(res, 200, {
            ok: true,
            idempotent: true,
            checkout,
          });
        }

        const timestamp = nowIso();
        const provider = resolveCheckoutProvider(db, checkout);
        const result = processPaymentEvent(db, {
          provider,
          externalEventId: `checkout:cancel:${checkout.id}:${timestamp}`,
          checkoutId: checkout.id,
          status: "canceled",
          payload: {
            source: "checkout_cancel_api",
            actorUserId: actorUser.id,
            actorRole: actorUser.role,
          },
          processedAt: timestamp,
        });
        saveDb();
        return json(res, 200, {
          ok: true,
          event: result.event,
          checkout: result.checkout,
        });
      }

      if (path === "/api/payments/providers/card/webhook" && method === "POST") {
        const rawBody = await readRawBody(req);
        const signatureHeader = req.headers["x-card-signature"];
        const timestampHeader = req.headers["x-card-timestamp"];
        const signature = Array.isArray(signatureHeader)
          ? signatureHeader[0] ?? ""
          : signatureHeader ?? "";
        const timestamp = Array.isArray(timestampHeader)
          ? timestampHeader[0] ?? ""
          : timestampHeader ?? "";
        if (!hasValidCardWebhookSignature(rawBody, String(timestamp), String(signature))) {
          return json(res, 401, { error: "Некорректная подпись webhook." });
        }

        type CardWebhookBody = {
          eventId?: string;
          checkoutId?: string;
          status?: unknown;
          providerPaymentId?: string;
          occurredAt?: string;
          payload?: unknown;
        };
        let body: CardWebhookBody = {};
        try {
          body = rawBody ? (JSON.parse(rawBody) as CardWebhookBody) : {};
        } catch {
          return json(res, 400, { error: "Некорректный JSON webhook." });
        }
        const externalEventId =
          typeof body?.eventId === "string" ? body.eventId.trim() : "";
        const checkoutId =
          typeof body?.checkoutId === "string" ? body.checkoutId.trim() : "";
        const webhookStatus = normalizeCardWebhookStatus(body?.status);
        if (!externalEventId || !checkoutId || !webhookStatus) {
          return json(res, 400, { error: "Некорректный payload card webhook." });
        }
        const processedAt =
          typeof body?.occurredAt === "string" &&
          Number.isFinite(new Date(body.occurredAt).getTime())
            ? body.occurredAt
            : nowIso();
        const paymentStatus = mapCardWebhookToPaymentStatus(webhookStatus);
        const result = processPaymentEvent(db, {
          provider: "card",
          externalEventId,
          checkoutId,
          status: paymentStatus,
          payload: {
            source: "card_webhook",
            providerPaymentId: body?.providerPaymentId ?? null,
            webhookStatus,
            payload: body?.payload ?? null,
          },
          processedAt,
        });
        if (result.checkout) {
          ensureCheckoutProvisioned(db, result.checkout, processedAt);
          if (paymentStatus === "paid") {
            queueCheckoutTransactionalEmail(db, result.checkout, processedAt);
          }
        }

        if (
          (webhookStatus === "refunded" || webhookStatus === "chargeback") &&
          result.checkout?.userId &&
          result.event.outcome !== "duplicate"
        ) {
          const revokeResult = revokeCourseAccess(
            db,
            {
              userId: result.checkout.userId,
              courseId: result.checkout.courseId,
              notes:
                webhookStatus === "refunded"
                  ? "Card webhook refund"
                  : "Card webhook chargeback",
            },
            processedAt
          );
          logSupportAction(
            db,
            {
              type: "refund_and_revoke_course_access",
              issueCode: "refunded_with_access",
              userId: result.checkout.userId,
              courseId: result.checkout.courseId,
              checkoutId: result.checkout.id,
              notes: `${webhookStatus}; purchasesRemoved=${revokeResult.purchasesRemoved}; revokedEntitlements=${revokeResult.revokedEntitlements}`,
            },
            processedAt
          );
        }

        await dispatchOutboxQueue(db, processedAt);
        saveDb();
        return json(res, 200, {
          ok: true,
          event: result.event,
          checkout: result.checkout,
        });
      }

      if (path === "/api/payments/events" && method === "POST") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Операция доступна только преподавателю.",
          });
        }
        const body = (await readBody(req)) as {
          provider: PaymentEventProvider;
          externalEventId: string;
          checkoutId: string;
          status: PaymentEventStatus;
          payload?: unknown;
        };
        if (
          !isPaymentEventProvider(body?.provider) ||
          typeof body?.externalEventId !== "string" ||
          !body.externalEventId.trim() ||
          typeof body?.checkoutId !== "string" ||
          !body.checkoutId.trim() ||
          !isPaymentEventStatus(body?.status)
        ) {
          return json(res, 400, { error: "Некорректный payload события оплаты." });
        }
        const timestamp = nowIso();
        const result = processPaymentEvent(db, {
          provider: body.provider,
          externalEventId: body.externalEventId.trim(),
          checkoutId: body.checkoutId.trim(),
          status: body.status,
          payload: body.payload,
          processedAt: timestamp,
        });
        if (result.checkout) {
          ensureCheckoutProvisioned(db, result.checkout, timestamp);
          queueCheckoutTransactionalEmail(db, result.checkout, timestamp);
        }
        await dispatchOutboxQueue(db, timestamp);
        saveDb();
        return json(res, 200, result);
      }

      if (path === "/api/payments/events" && method === "GET") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Операция доступна только преподавателю.",
          });
        }
        const checkoutId = decodeURIComponent(url.searchParams.get("checkoutId") ?? "");
        const provider = decodeURIComponent(url.searchParams.get("provider") ?? "");
        let events = db.paymentEvents;
        if (checkoutId) {
          events = events.filter((event) => event.checkoutId === checkoutId);
        }
        if (provider) {
          events = events.filter((event) => event.provider === provider);
        }
        return json(
          res,
          200,
          [...events].sort((a, b) => b.processedAt.localeCompare(a.processedAt))
        );
      }

      if (path === "/api/payments/providers/card/refund" && method === "POST") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Операция доступна только преподавателю.",
          });
        }
        const body = (await readBody(req)) as {
          checkoutId?: string;
          reason?: string;
        };
        const checkoutId =
          typeof body?.checkoutId === "string" ? body.checkoutId.trim() : "";
        if (!checkoutId) {
          return json(res, 400, { error: "checkoutId обязателен." });
        }
        const checkout =
          db.checkoutProcesses.find((item) => item.id === checkoutId) ?? null;
        if (!checkout) {
          return json(res, 404, { error: "Checkout не найден." });
        }
        const timestamp = nowIso();
        const providerPaymentId = db.paymentEvents
          .filter(
            (event) => event.provider === "card" && event.checkoutId === checkoutId
          )
          .map((event) => {
            if (!event.payload) return undefined;
            try {
              const payload = JSON.parse(event.payload) as Record<string, unknown>;
              return getProviderPaymentIdFromPayload(payload);
            } catch {
              return undefined;
            }
          })
          .find(Boolean);
        const result = processPaymentEvent(db, {
          provider: "card",
          externalEventId: `card:refund:${checkout.id}:${timestamp}`,
          checkoutId: checkout.id,
          status: "canceled",
          payload: {
            source: "card_refund_api",
            reason: typeof body?.reason === "string" ? body.reason.trim() : "",
            providerPaymentId: providerPaymentId ?? null,
          },
          processedAt: timestamp,
        });
        let revokeResult: ReturnType<typeof revokeCourseAccess> | null = null;
        if (checkout.userId) {
          revokeResult = revokeCourseAccess(
            db,
            {
              userId: checkout.userId,
              courseId: checkout.courseId,
              notes: "Card refund API",
            },
            timestamp
          );
          logSupportAction(
            db,
            {
              type: "refund_and_revoke_course_access",
              issueCode: "refunded_with_access",
              userId: checkout.userId,
              courseId: checkout.courseId,
              checkoutId: checkout.id,
              notes: `card_refund_api; purchasesRemoved=${revokeResult.purchasesRemoved}; revokedEntitlements=${revokeResult.revokedEntitlements}`,
            },
            timestamp
          );
        }
        saveDb();
        return json(res, 200, {
          ok: true,
          event: result.event,
          checkout,
          revokeResult,
        });
      }

      if (path === "/api/notifications/outbox" && method === "GET") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Операция доступна только преподавателю.",
          });
        }
        const status = decodeURIComponent(url.searchParams.get("status") ?? "");
        const template = decodeURIComponent(url.searchParams.get("template") ?? "");
        const email = normalizeEmail(url.searchParams.get("email"));
        let items = db.outbox;
        if (status === "queued" || status === "sent" || status === "failed") {
          items = items.filter((item) => item.status === status);
        }
        if (template) {
          items = items.filter((item) => item.template === template);
        }
        if (email) {
          items = items.filter(
            (item) => normalizeEmail(item.recipientEmail) === email
          );
        }
        return json(
          res,
          200,
          [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        );
      }

      if (path === "/api/notifications/outbox/retry" && method === "POST") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Операция доступна только преподавателю.",
          });
        }
        const body = (await readBody(req)) as { id?: string };
        const id = typeof body?.id === "string" ? body.id.trim() : "";
        if (!id) {
          return json(res, 400, { error: "id обязателен." });
        }
        const record = db.outbox.find((item) => item.id === id) ?? null;
        if (!record) {
          return json(res, 404, { error: "Письмо не найдено." });
        }
        const timestamp = nowIso();
        record.status = "queued";
        record.updatedAt = timestamp;
        const delivered = await dispatchOutboxQueue(db, timestamp);
        saveDb();
        return json(res, 200, {
          ok: true,
          delivered,
          record,
        });
      }

      if (path === "/api/support/self-heal-access" && method === "POST") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        if (actorUser.role !== "student") {
          return json(res, 403, {
            error: "Операция доступна только студенту.",
          });
        }
        const body = (await readBody(req)) as { courseId?: string };
        const requestedCourseId =
          typeof body?.courseId === "string" && body.courseId.trim()
            ? body.courseId.trim()
            : undefined;
        const timestamp = nowIso();
        const identity = getIdentityRecord(db, {
          userId: actorUser.id,
          email: actorUser.email,
        });
        if (identity?.state !== "verified") {
          return json(res, 409, {
            error:
              "Сначала подтвердите email через вход по magic-link, затем повторите восстановление доступа.",
            code: "verification_required",
          });
        }
        const profileComplete = Boolean(
          actorUser.firstName?.trim() &&
            actorUser.lastName?.trim() &&
            normalizePhoneStorage(actorUser.phone)
        );
        if (!profileComplete) {
          return json(res, 409, {
            error:
              "Заполните имя, фамилию и телефон в профиле, затем повторите восстановление доступа.",
            code: "profile_incomplete",
          });
        }

        const filters = {
          userId: actorUser.id,
          courseId: requestedCourseId,
        };
        const initialIssues = buildReconciliationIssues(db, filters).filter(
          (issue) =>
            issue.code === "paid_without_access" ||
            issue.code === "duplicate_purchases"
        );

        const applied: Array<{
          code: ReconciliationIssueCode;
          courseId: string;
          operation: "restore_access_from_paid_checkout" | "dedupe_duplicate_purchases";
          result: "applied" | "skipped";
          details: string;
        }> = [];

        initialIssues.forEach((issue) => {
          if (issue.code === "paid_without_access") {
            const restored = restoreCourseAccessFromPaidCheckout(
              db,
              {
                userId: actorUser.id,
                courseId: issue.courseId,
              },
              timestamp
            );
            if (!restored.restored) {
              applied.push({
                code: issue.code,
                courseId: issue.courseId,
                operation: "restore_access_from_paid_checkout",
                result: "skipped",
                details: String(restored.reason ?? "restore_failed"),
              });
              return;
            }
            logSupportAction(
              db,
              {
                type: "restore_access_from_paid_checkout",
                issueCode: issue.code,
                userId: actorUser.id,
                courseId: issue.courseId,
                checkoutId: restored.checkoutId,
                notes: "self_heal_student_portal",
              },
              timestamp
            );
            applied.push({
              code: issue.code,
              courseId: issue.courseId,
              operation: "restore_access_from_paid_checkout",
              result: "applied",
              details: String(restored.checkoutId ?? "restored"),
            });
            return;
          }

          const deduped = dedupePurchasesForCourse(db, {
            userId: actorUser.id,
            courseId: issue.courseId,
          });
          if (deduped.removed <= 0) {
            applied.push({
              code: issue.code,
              courseId: issue.courseId,
              operation: "dedupe_duplicate_purchases",
              result: "skipped",
              details: "no_duplicates",
            });
            return;
          }
          logSupportAction(
            db,
            {
              type: "dedupe_duplicate_purchases",
              issueCode: issue.code,
              userId: actorUser.id,
              courseId: issue.courseId,
              notes: `self_heal_student_portal; removed=${deduped.removed}`,
            },
            timestamp
          );
          applied.push({
            code: issue.code,
            courseId: issue.courseId,
            operation: "dedupe_duplicate_purchases",
            result: "applied",
            details: `removed=${deduped.removed}`,
          });
        });

        activatePendingEntitlements(db, actorUser.id, timestamp);
        ensureUserCourseArtifacts(
          db,
          {
            userId: actorUser.id,
            email: actorUser.email,
          },
          timestamp
        );

        const remainingIssues = buildReconciliationIssues(db, filters).filter(
          (issue) =>
            issue.code === "paid_without_access" ||
            issue.code === "duplicate_purchases"
        );
        saveDb();
        return json(res, 200, {
          ok: true,
          initialCount: initialIssues.length,
          appliedCount: applied.filter((item) => item.result === "applied").length,
          skippedCount: applied.filter((item) => item.result === "skipped").length,
          remainingCount: remainingIssues.length,
          applied,
        });
      }

      if (path === "/api/support/reconciliation/issues" && method === "GET") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Операция доступна только преподавателю.",
          });
        }
        const userId = decodeURIComponent(url.searchParams.get("userId") ?? "");
        const courseId = decodeURIComponent(url.searchParams.get("courseId") ?? "");
        const issues = buildReconciliationIssues(db, {
          userId: userId || undefined,
          courseId: courseId || undefined,
        });
        return json(res, 200, { count: issues.length, issues });
      }

      if (path === "/api/support/actions" && method === "GET") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Операция доступна только преподавателю.",
          });
        }
        const actions = [...db.supportActions].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
        return json(res, 200, actions);
      }

      if (path === "/api/support/reconciliation/run" && method === "POST") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Операция доступна только преподавателю.",
          });
        }
        const body = (await readBody(req)) as {
          dryRun?: boolean;
          includeHighRisk?: boolean;
          userId?: string;
          courseId?: string;
        };
        const dryRun = Boolean(body?.dryRun);
        const includeHighRisk = Boolean(body?.includeHighRisk);
        const filters = {
          userId:
            typeof body?.userId === "string" && body.userId.trim()
              ? body.userId.trim()
              : undefined,
          courseId:
            typeof body?.courseId === "string" && body.courseId.trim()
              ? body.courseId.trim()
              : undefined,
        };
        const initialIssues = buildReconciliationIssues(db, filters);
        const timestamp = nowIso();

        const planned = initialIssues.map((issue) => {
          if (issue.code === "paid_without_access") {
            return {
              issue,
              operation: "restore_access_from_paid_checkout" as const,
              mode: "safe" as const,
            };
          }
          if (issue.code === "duplicate_purchases") {
            return {
              issue,
              operation: "dedupe_duplicate_purchases" as const,
              mode: "safe" as const,
            };
          }
          if (issue.code === "refunded_with_access") {
            return {
              issue,
              operation: "refund_and_revoke_course_access" as const,
              mode: includeHighRisk ? ("safe" as const) : ("manual" as const),
            };
          }
          return {
            issue,
            operation: "manual_review" as const,
            mode: "manual" as const,
          };
        });

        if (dryRun) {
          return json(res, 200, {
            ok: true,
            dryRun: true,
            includeHighRisk,
            initialCount: initialIssues.length,
            plannedSafeCount: planned.filter((item) => item.mode === "safe").length,
            plannedManualCount: planned.filter((item) => item.mode === "manual").length,
            planned: planned.map((item) => ({
              code: item.issue.code,
              userId: item.issue.userId,
              courseId: item.issue.courseId,
              operation: item.operation,
              mode: item.mode,
            })),
          });
        }

        const applied: Array<{
          code: ReconciliationIssueCode;
          userId: string;
          courseId: string;
          operation: string;
          result: "applied" | "skipped";
          details: string;
        }> = [];

        planned.forEach((item) => {
          if (item.mode !== "safe") {
            applied.push({
              code: item.issue.code,
              userId: item.issue.userId,
              courseId: item.issue.courseId,
              operation: item.operation,
              result: "skipped",
              details: "manual_review_required",
            });
            return;
          }

          if (item.operation === "restore_access_from_paid_checkout") {
            const restored = restoreCourseAccessFromPaidCheckout(
              db,
              {
                userId: item.issue.userId,
                courseId: item.issue.courseId,
              },
              timestamp
            );
            if (!restored.restored) {
              applied.push({
                code: item.issue.code,
                userId: item.issue.userId,
                courseId: item.issue.courseId,
                operation: item.operation,
                result: "skipped",
                details: String(restored.reason ?? "restore_failed"),
              });
              return;
            }
            logSupportAction(
              db,
              {
                type: "restore_access_from_paid_checkout",
                issueCode: item.issue.code,
                userId: item.issue.userId,
                courseId: item.issue.courseId,
                checkoutId: restored.checkoutId,
                notes: "auto_reconcile_phase18",
              },
              timestamp
            );
            applied.push({
              code: item.issue.code,
              userId: item.issue.userId,
              courseId: item.issue.courseId,
              operation: item.operation,
              result: "applied",
              details: String(restored.checkoutId ?? "restored"),
            });
            return;
          }

          if (item.operation === "dedupe_duplicate_purchases") {
            const deduped = dedupePurchasesForCourse(db, {
              userId: item.issue.userId,
              courseId: item.issue.courseId,
            });
            if (deduped.removed <= 0) {
              applied.push({
                code: item.issue.code,
                userId: item.issue.userId,
                courseId: item.issue.courseId,
                operation: item.operation,
                result: "skipped",
                details: "no_duplicates",
              });
              return;
            }
            logSupportAction(
              db,
              {
                type: "dedupe_duplicate_purchases",
                issueCode: item.issue.code,
                userId: item.issue.userId,
                courseId: item.issue.courseId,
                notes: `auto_reconcile_phase18; removed=${deduped.removed}`,
              },
              timestamp
            );
            applied.push({
              code: item.issue.code,
              userId: item.issue.userId,
              courseId: item.issue.courseId,
              operation: item.operation,
              result: "applied",
              details: `removed=${deduped.removed}`,
            });
            return;
          }

          const revoked = revokeCourseAccess(
            db,
            {
              userId: item.issue.userId,
              courseId: item.issue.courseId,
              notes: "auto_reconcile_phase18",
            },
            timestamp
          );
          logSupportAction(
            db,
            {
              type: "refund_and_revoke_course_access",
              issueCode: item.issue.code,
              userId: item.issue.userId,
              courseId: item.issue.courseId,
              notes: `auto_reconcile_phase18; purchasesRemoved=${revoked.purchasesRemoved}; revokedEntitlements=${revoked.revokedEntitlements}`,
            },
            timestamp
          );
          applied.push({
            code: item.issue.code,
            userId: item.issue.userId,
            courseId: item.issue.courseId,
            operation: item.operation,
            result: "applied",
            details: `purchasesRemoved=${revoked.purchasesRemoved}; revokedEntitlements=${revoked.revokedEntitlements}`,
          });
        });

        const remainingIssues = buildReconciliationIssues(db, filters);
        saveDb();
        return json(res, 200, {
          ok: true,
          dryRun: false,
          includeHighRisk,
          initialCount: initialIssues.length,
          appliedCount: applied.filter((item) => item.result === "applied").length,
          skippedCount: applied.filter((item) => item.result === "skipped").length,
          remainingCount: remainingIssues.length,
          applied,
          remainingIssues,
        });
      }

      if (path === "/api/support/reconciliation/apply" && method === "POST") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, {
            error: "Операция доступна только преподавателю.",
          });
        }
        const body = (await readBody(req)) as {
          action: SupportActionType;
          userId: string;
          courseId: string;
          checkoutId?: string;
          issueCode?: ReconciliationIssueCode;
          notes?: string;
        };
        if (
          (body?.action !== "restore_access_from_paid_checkout" &&
            body?.action !== "revoke_unpaid_access" &&
            body?.action !== "dedupe_duplicate_purchases" &&
            body?.action !== "refund_and_revoke_course_access") ||
          typeof body?.userId !== "string" ||
          !body.userId.trim() ||
          typeof body?.courseId !== "string" ||
          !body.courseId.trim()
        ) {
          return json(res, 400, { error: "Некорректный payload действия." });
        }

        const timestamp = nowIso();
        const userId = body.userId.trim();
        const courseId = body.courseId.trim();
        const action = body.action;

        if (action === "restore_access_from_paid_checkout") {
          const restored = restoreCourseAccessFromPaidCheckout(
            db,
            {
              userId,
              courseId,
              checkoutId: body.checkoutId?.trim() || undefined,
            },
            timestamp
          );
          if (!restored.restored) {
            return json(res, 409, {
              error: "Невозможно восстановить доступ: отсутствует оплаченный checkout.",
              reason: restored.reason,
            });
          }
          logSupportAction(
            db,
            {
              type: action,
              issueCode: body.issueCode,
              userId,
              courseId,
              checkoutId: restored.checkoutId,
              notes: body.notes,
            },
            timestamp
          );
          saveDb();
          return json(res, 200, { ok: true, restored });
        }

        if (action === "revoke_unpaid_access") {
          const revoked = revokeCourseAccess(
            db,
            {
              userId,
              courseId,
              notes: body.notes,
            },
            timestamp
          );
          logSupportAction(
            db,
            {
              type: action,
              issueCode: body.issueCode,
              userId,
              courseId,
              notes: body.notes,
            },
            timestamp
          );
          saveDb();
          return json(res, 200, { ok: true, revoked });
        }

        if (action === "dedupe_duplicate_purchases") {
          const deduped = dedupePurchasesForCourse(db, { userId, courseId });
          logSupportAction(
            db,
            {
              type: action,
              issueCode: body.issueCode,
              userId,
              courseId,
              notes: body.notes,
            },
            timestamp
          );
          saveDb();
          return json(res, 200, { ok: true, deduped });
        }

        const relatedCheckouts = db.checkoutProcesses.filter(
          (checkout) => checkout.userId === userId && checkout.courseId === courseId
        );
        relatedCheckouts.forEach((checkout) => {
          processPaymentEvent(db, {
            provider: "mock",
            externalEventId: `support-refund:${checkout.id}:${timestamp}`,
            checkoutId: checkout.id,
            status: "canceled",
            payload: {
              source: "support_refund",
              notes: body.notes,
            },
            processedAt: timestamp,
          });
        });
        const revoked = revokeCourseAccess(
          db,
          {
            userId,
            courseId,
            notes: body.notes,
          },
          timestamp
        );
        logSupportAction(
          db,
          {
            type: action,
            issueCode: body.issueCode,
            userId,
            courseId,
            notes: body.notes,
          },
          timestamp
        );
        saveDb();
        return json(res, 200, {
          ok: true,
          refundedCheckouts: relatedCheckouts.length,
          revoked,
        });
      }

      if (path === "/api/purchases" && method === "DELETE") {
        const courseId = url.searchParams.get("courseId");
        if (!courseId) {
          return json(res, 400, { error: "courseId is required" });
        }
        db.purchases = db.purchases.filter((p) => p.courseId !== courseId);
        saveDb();
        return json(res, 200, { ok: true });
      }

      // ================= PROGRESS =================
      if (path === "/api/progress" && method === "GET") {
        const userId = url.searchParams.get("userId");
        const courseId = url.searchParams.get("courseId");
        if (!userId || !courseId) return json(res, 200, []);
        const ids = db.progress
          .filter((p) => p.userId === userId && p.courseId === courseId)
          .map((p) => p.lessonId);
        return json(res, 200, ids);
      }

      if (path === "/api/progress" && method === "DELETE") {
        const courseId = url.searchParams.get("courseId");
        if (!courseId) {
          return json(res, 400, { error: "courseId is required" });
        }
        db.progress = db.progress.filter((p) => p.courseId !== courseId);
        saveDb();
        return json(res, 200, { ok: true });
      }

      if (path === "/api/progress/viewed" && method === "POST") {
        const body = (await readBody(req)) as {
          userId: string;
          courseId: string;
          lessonId: string;
        };
        const exists = db.progress.some(
          (p) =>
            p.userId === body.userId &&
            p.courseId === body.courseId &&
            p.lessonId === body.lessonId
        );
        if (!exists) {
          db.progress.push({
            userId: body.userId,
            courseId: body.courseId,
            lessonId: body.lessonId,
            completed: true,
          });
          saveDb();
        }
        return json(res, 200, { ok: true });
      }

      // ================= TEACHER PROFILES =================
      const profileMatch = path.match(/^\/api\/teacher-profiles\/([^/]+)$/);
      if (profileMatch && method === "GET") {
        const userId = decodeURIComponent(profileMatch[1]);
        const profile =
          db.teacherProfiles[userId] ?? {
            firstName: "",
            lastName: "",
            about: "",
            experience: [],
            achievements: [],
            diplomas: [],
            photo: "",
          };
        return json(res, 200, profile);
      }

      if (profileMatch && method === "PUT") {
        const userId = decodeURIComponent(profileMatch[1]);
        if (!actorUser || actorUser.role !== "teacher" || actorUser.id !== userId) {
          return json(res, 403, {
            error: "Редактировать профиль преподавателя можно только из его аккаунта.",
          });
        }
        const profile = await readBody(req);
        db.teacherProfiles[userId] = profile;
        saveDb();
        return json(res, 200, profile);
      }

      // ================= TEACHER AVAILABILITY =================
      const availabilityMatch = path.match(/^\/api\/teacher-availability\/([^/]+)$/);
      if (availabilityMatch && method === "GET") {
        const userId = decodeURIComponent(availabilityMatch[1]);
        const availability = db.teacherAvailability[userId] ?? [];
        const nextAvailability = sanitizeAvailabilitySlots(availability);
        if (!hasSameAvailability(availability, nextAvailability)) {
          db.teacherAvailability[userId] = nextAvailability;
          saveDb();
        }
        return json(res, 200, nextAvailability);
      }

      if (availabilityMatch && method === "PUT") {
        const userId = decodeURIComponent(availabilityMatch[1]);
        if (!actorUser || actorUser.role !== "teacher" || actorUser.id !== userId) {
          return json(res, 403, {
            error: "Изменять слоты может только преподаватель своего кабинета.",
          });
        }
        const availability = await readBody(req);
        const parsed = Array.isArray(availability) ? availability : [];
        const nextAvailability = parsed.map((slot) => ({
          id: typeof slot?.id === "string" && slot.id ? slot.id : ensureId(),
          date: typeof slot?.date === "string" ? slot.date : "",
          startTime:
            typeof slot?.startTime === "string" ? slot.startTime : "",
          endTime: typeof slot?.endTime === "string" ? slot.endTime : "",
        }));

        const hasInvalid = nextAvailability.some(
          (slot) =>
            !slot.date ||
            !slot.startTime ||
            !slot.endTime ||
            !hasValidTimeRange(slot.startTime, slot.endTime) ||
            !isFutureDateTime(slot.date, slot.startTime)
        );
        if (hasInvalid) {
          return json(res, 400, {
            error:
              "Нельзя сохранять слоты в прошлом или с некорректным диапазоном времени.",
          });
        }

        const hasOverlaps = nextAvailability.some((slot, index) =>
          nextAvailability.some((other, otherIndex) => {
            if (index >= otherIndex) return false;
            if (slot.date !== other.date) return false;
            return overlaps(
              slot.startTime,
              slot.endTime,
              other.startTime,
              other.endTime
            );
          })
        );
        if (hasOverlaps) {
          return json(res, 400, {
            error: "Слоты пересекаются по времени. Исправьте расписание.",
          });
        }

        const hasBookingOverlap = db.bookings.some((booking) => {
          if (booking.teacherId !== userId) return false;
          if (!isFutureDateTime(booking.date, booking.startTime)) return false;
          return nextAvailability.some((slot) => {
            if (slot.date !== booking.date) return false;
            return overlaps(
              slot.startTime,
              slot.endTime,
              booking.startTime,
              booking.endTime
            );
          });
        });
        if (hasBookingOverlap) {
          return json(res, 400, {
            error:
              "Новый слот пересекается с уже запланированным занятием. Выберите другое время.",
          });
        }

        db.teacherAvailability[userId] = nextAvailability.sort(
          (a, b) =>
            toStartTimestamp(a.date, a.startTime) -
            toStartTimestamp(b.date, b.startTime)
        );
        saveDb();
        return json(res, 200, db.teacherAvailability[userId]);
      }

      // ================= BOOKINGS =================
      if (path === "/api/bookings" && method === "GET") {
        if (!actorUser) {
          return json(res, 200, []);
        }
        let teacherId = url.searchParams.get("teacherId");
        let studentId = url.searchParams.get("studentId");
        if (actorUser.role === "student") {
          if (studentId && studentId !== actorUser.id) {
            return json(res, 403, { error: "Недопустимый контекст записей." });
          }
          studentId = actorUser.id;
        } else {
          if (teacherId && teacherId !== actorUser.id) {
            return json(res, 403, { error: "Недопустимый контекст записей." });
          }
          teacherId = teacherId || actorUser.id;
        }
        let bookings = db.bookings;
        if (teacherId) {
          bookings = bookings.filter((b) => b.teacherId === teacherId);
        }
        if (studentId) {
          bookings = bookings.filter((b) => b.studentId === studentId);
        }
        return json(res, 200, bookings);
      }

      if (path === "/api/bookings" && method === "POST") {
        const body = (await readBody(req)) as {
          teacherId: string;
          teacherName: string;
          teacherPhoto?: string;
          studentId?: string;
          studentName?: string;
          studentEmail: string;
          studentFirstName?: string;
          studentLastName?: string;
          studentPhone?: string;
          studentPhoto?: string;
          slotId: string;
          date: string;
          startTime: string;
          endTime: string;
          lessonKind?: "trial" | "regular";
          consents?: {
            acceptedScopes?: unknown;
          };
        };
        const idempotency = resolveIdempotencyRequest(
          db,
          req,
          path,
          method,
          body
        );
        if (idempotency.mode === "replay") {
          return json(res, idempotency.statusCode, idempotency.response);
        }
        if (idempotency.mode === "conflict") {
          return json(res, 409, {
            error:
              "Idempotency ключ уже использован с другим payload. Сгенерируйте новый запрос.",
            code: "idempotency_conflict",
          });
        }
        const timestamp = nowIso();

        if (actorUser?.role === "teacher") {
          return json(res, 403, {
            error:
              "Вы сами себе лучший репетитор. Записаться как преподаватель нельзя.",
          });
        }
        if (actorUser?.role === "student") {
          const verifiedStudent = isIdentityVerified(db, {
            userId: actorUser.id,
            email: actorUser.email,
          });
          if (!verifiedStudent) {
            return json(res, 403, {
              error:
                "Подтвердите email через вход по magic-link, чтобы записываться на занятия.",
              code: "email_verification_required",
              nextAction: "verify_email",
            });
          }
          const requestedEmail = normalizeEmail(body.studentEmail);
          if (body.studentId && body.studentId !== actorUser.id) {
            return json(res, 409, {
              error: "Запись можно оформить только для текущего аккаунта.",
            });
          }
          if (
            requestedEmail &&
            requestedEmail !== normalizeEmail(actorUser.email)
          ) {
            return json(res, 409, {
              error: "Email записи должен совпадать с авторизованным аккаунтом.",
            });
          }
          body.studentId = actorUser.id;
          body.studentEmail = actorUser.email;
          body.studentFirstName = actorUser.firstName;
          body.studentLastName = actorUser.lastName;
          body.studentPhone = actorUser.phone;
          body.studentPhoto = actorUser.photo;
        }

        const availableSlots = db.teacherAvailability[body.teacherId] ?? [];
        const selectedSlot = availableSlots.find((slot) => slot.id === body.slotId);
        if (!selectedSlot) {
          return json(res, 409, { error: "Слот уже недоступен" });
        }
        if (
          !hasValidTimeRange(selectedSlot.startTime, selectedSlot.endTime) ||
          !isFutureDateTime(selectedSlot.date, selectedSlot.startTime)
        ) {
          db.teacherAvailability[body.teacherId] = availableSlots.filter(
            (slot) => slot.id !== body.slotId
          );
          saveDb();
          return json(res, 409, { error: "Слот уже недоступен" });
        }

        const studentEmail = normalizeEmail(body.studentEmail);
        if (!studentEmail) {
          return json(res, 400, { error: "Email обязателен" });
        }
        if (teacherEmailSet.has(studentEmail)) {
          return json(res, 400, {
            error:
              "Этот email зарезервирован для преподавателя. Используйте email ученика.",
          });
        }

        const firstName = body.studentFirstName?.trim() ?? "";
        const lastName = body.studentLastName?.trim() ?? "";
        const phone = normalizePhoneStorage(body.studentPhone);

        let student =
          (body.studentId
            ? db.users.find((u) => u.id === body.studentId)
            : null) ??
          db.users.find((u) => normalizeEmail(u.email) === studentEmail) ??
          null;

        const consentCheck = ensureVersionedConsents(db, {
          email: studentEmail,
          userId: student?.id,
          requiredScopes: ["terms", "privacy", "trial_booking"],
          acceptedScopes: body.consents?.acceptedScopes,
          capturedAt: timestamp,
        });
        if (!consentCheck.ok) {
          return json(res, consentCheck.status, consentCheck.body);
        }

        if (!body.studentId && student) {
          return json(res, 409, {
            error:
              "Пользователь с этим email уже зарегистрирован. Авторизуйтесь и запишитесь из аккаунта.",
            code: "identity_conflict_auth_required",
            nextAction: "login_and_attach",
          });
        }

        if (!student) {
          if (!firstName || !lastName) {
            return json(res, 400, {
              error: "Введите имя и фамилию для оформления записи.",
            });
          }
          student = {
            id: ensureId(),
            email: studentEmail,
            firstName,
            lastName,
            phone,
            role: "student",
            password: "magic",
          };
          db.users.push(student);
          upsertIdentityRecord(
            db,
            {
              email: student.email,
              userId: student.id,
              state: "known_unverified",
            },
            timestamp
          );
        } else {
          if (student.role === "teacher") {
            return json(res, 400, {
              error:
                "Этот email принадлежит преподавателю. Используйте email ученика.",
            });
          }
          if (firstName) student.firstName = firstName;
          if (lastName) student.lastName = lastName;
          if (phone) student.phone = phone;
          upsertIdentityRecord(
            db,
            {
              email: student.email,
              userId: student.id,
              state: getNextIdentityStateForUser(db, {
                email: student.email,
                userId: student.id,
              }),
            },
            timestamp
          );
        }

        const studentName =
          body.studentName?.trim() ||
          `${student.firstName} ${student.lastName}`.trim() ||
          student.email;
        const hasPreviousBookings = db.bookings.some(
          (booking) => booking.studentId === student.id
        );
        // First lesson for a student is always trial, then regular.
        const lessonKind: "trial" | "regular" = hasPreviousBookings
          ? "regular"
          : "trial";

        const booking = {
          id: ensureId(),
          teacherId: body.teacherId,
          teacherName: body.teacherName,
          teacherPhoto: body.teacherPhoto,
          studentId: student.id,
          studentName,
          studentEmail: student.email,
          studentPhone: student.phone ?? phone,
          studentPhoto: body.studentPhoto ?? student.photo,
          date: selectedSlot.date,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          lessonKind,
          paymentStatus: "unpaid" as const,
          meetingUrl: "",
          materials: [],
          createdAt: timestamp,
        };

        db.bookings.push(booking);
        db.teacherAvailability[body.teacherId] = availableSlots.filter(
          (slot) => slot.id !== body.slotId
        );
        upsertBookingLifecycle(db, booking.id, "requested", timestamp);
        upsertBookingLifecycle(db, booking.id, "scheduled", timestamp);
        if (lessonKind === "trial") {
          const canActivateTrialEntitlement = isIdentityVerified(db, {
            userId: student.id,
            email: student.email,
          });
          upsertTrialEntitlement(
            db,
            {
              userId: student.id,
              sourceId: booking.id,
              activate: canActivateTrialEntitlement,
            },
            timestamp
          );
        }
        captureConsent(
          db,
          {
            email: student.email,
            userId: student.id,
            scope: "trial_booking",
          },
          timestamp
        );
        registerIdempotencyResponse(
          db,
          idempotency.mode === "new" ? idempotency.record : null,
          200,
          booking,
          timestamp
        );
        saveDb();
        return json(res, 200, booking);
      }

      const bookingMatch = path.match(/^\/api\/bookings\/([^/]+)$/);
      if (bookingMatch && method === "PUT") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const bookingId = decodeURIComponent(bookingMatch[1]);
        const patch = (await readBody(req)) as Partial<{
          meetingUrl: string;
          paymentStatus: "unpaid" | "paid";
          materials: {
            id: string;
            name: string;
            type: "pdf" | "doc" | "video";
            url: string;
          }[];
          reschedule: {
            slotId: string;
          };
        }>;
        const bookingIndex = db.bookings.findIndex((b) => b.id === bookingId);
        if (bookingIndex === -1) {
          return json(res, 404, { error: "Booking not found" });
        }
        const existing = db.bookings[bookingIndex];
        const canManageAsTeacher =
          actorUser.role === "teacher" && existing.teacherId === actorUser.id;
        const canManageAsStudent =
          actorUser.role === "student" && existing.studentId === actorUser.id;
        if (!canManageAsTeacher && !canManageAsStudent) {
          return json(res, 403, { error: "Недопустимое изменение записи." });
        }
        if (
          canManageAsStudent &&
          !isIdentityVerified(db, {
            userId: actorUser.id,
            email: actorUser.email,
          })
        ) {
          return json(res, 403, {
            error:
              "Подтвердите email через вход по magic-link, чтобы изменять запись.",
            code: "email_verification_required",
            nextAction: "verify_email",
          });
        }
        if (
          canManageAsStudent &&
          (patch.paymentStatus !== undefined ||
            patch.meetingUrl !== undefined ||
            patch.materials !== undefined)
        ) {
          return json(res, 403, {
            error:
              "Ученик может только перенести или отменить занятие. Материалы и статус оплаты изменяет преподаватель.",
          });
        }

        if (patch.reschedule?.slotId) {
          const availableSlots = db.teacherAvailability[existing.teacherId] ?? [];
          const nextSlot = availableSlots.find(
            (slot) => slot.id === patch.reschedule?.slotId
          );
          if (!nextSlot) {
            return json(res, 409, { error: "Слот уже недоступен" });
          }
          if (
            !hasValidTimeRange(nextSlot.startTime, nextSlot.endTime) ||
            !isFutureDateTime(nextSlot.date, nextSlot.startTime)
          ) {
            db.teacherAvailability[existing.teacherId] = availableSlots.filter(
              (slot) => slot.id !== nextSlot.id
            );
            saveDb();
            return json(res, 409, { error: "Слот уже недоступен" });
          }

          const nextAvailability = availableSlots.filter(
            (slot) => slot.id !== nextSlot.id
          );

          if (
            hasValidTimeRange(existing.startTime, existing.endTime) &&
            isFutureDateTime(existing.date, existing.startTime)
          ) {
            const restoredExists = nextAvailability.some(
              (slot) =>
                slot.date === existing.date &&
                slot.startTime === existing.startTime &&
                slot.endTime === existing.endTime
            );
            if (!restoredExists) {
              nextAvailability.push({
                id: ensureId(),
                date: existing.date,
                startTime: existing.startTime,
                endTime: existing.endTime,
              });
            }
          }

          db.teacherAvailability[existing.teacherId] = nextAvailability.sort(
            (a, b) =>
              toStartTimestamp(a.date, a.startTime) -
              toStartTimestamp(b.date, b.startTime)
          );

          db.bookings[bookingIndex] = {
            ...existing,
            date: nextSlot.date,
            startTime: nextSlot.startTime,
            endTime: nextSlot.endTime,
            paymentStatus:
              patch.paymentStatus === "paid" || patch.paymentStatus === "unpaid"
                ? patch.paymentStatus
                : existing.paymentStatus,
            meetingUrl:
              typeof patch.meetingUrl === "string"
                ? patch.meetingUrl
                : existing.meetingUrl,
            materials: Array.isArray(patch.materials)
              ? patch.materials
              : existing.materials,
          };
          saveDb();
          return json(res, 200, db.bookings[bookingIndex]);
        }

        db.bookings[bookingIndex] = {
          ...existing,
          paymentStatus:
            patch.paymentStatus === "paid" || patch.paymentStatus === "unpaid"
              ? patch.paymentStatus
              : existing.paymentStatus,
          meetingUrl:
            typeof patch.meetingUrl === "string"
              ? patch.meetingUrl
              : existing.meetingUrl,
          materials: Array.isArray(patch.materials)
            ? patch.materials
            : existing.materials,
        };
        saveDb();
        return json(res, 200, db.bookings[bookingIndex]);
      }

      if (bookingMatch && method === "DELETE") {
        if (!actorUser) {
          return json(res, 401, { error: "Требуется авторизация." });
        }
        const bookingId = decodeURIComponent(bookingMatch[1]);
        const timestamp = nowIso();
        const bookingIndex = db.bookings.findIndex((b) => b.id === bookingId);
        if (bookingIndex === -1) {
          return json(res, 404, { error: "Booking not found" });
        }
        const existing = db.bookings[bookingIndex];
        const canDeleteAsTeacher =
          actorUser.role === "teacher" && existing.teacherId === actorUser.id;
        const canDeleteAsStudent =
          actorUser.role === "student" && existing.studentId === actorUser.id;
        if (!canDeleteAsTeacher && !canDeleteAsStudent) {
          return json(res, 403, { error: "Недопустимое удаление записи." });
        }
        if (
          canDeleteAsStudent &&
          !isIdentityVerified(db, {
            userId: actorUser.id,
            email: actorUser.email,
          })
        ) {
          return json(res, 403, {
            error:
              "Подтвердите email через вход по magic-link, чтобы отменять запись.",
            code: "email_verification_required",
            nextAction: "verify_email",
          });
        }
        const canRestoreSlot =
          hasValidTimeRange(existing.startTime, existing.endTime) &&
          isFutureDateTime(existing.date, existing.startTime);
        if (canRestoreSlot) {
          const availability = db.teacherAvailability[existing.teacherId] ?? [];
          const exists = availability.some(
            (slot) =>
              slot.date === existing.date &&
              slot.startTime === existing.startTime &&
              slot.endTime === existing.endTime
          );
          if (!exists) {
            availability.push({
              id: ensureId(),
              date: existing.date,
              startTime: existing.startTime,
              endTime: existing.endTime,
            });
            db.teacherAvailability[existing.teacherId] = availability.sort(
              (a, b) =>
                toStartTimestamp(a.date, a.startTime) -
                toStartTimestamp(b.date, b.startTime)
            );
          }
        }
        upsertBookingLifecycle(db, bookingId, "canceled", timestamp);
        revokeBookingEntitlements(db, bookingId, timestamp);
        db.bookings.splice(bookingIndex, 1);
        saveDb();
        return json(res, 200, { id: bookingId });
      }

      // ================= NEWS =================
      if (path === "/api/news" && method === "GET") {
        const sorted = [...db.news].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
        const filtered = sorted.filter((item) => {
          if (actorUser?.role === "teacher" && item.tone === "course_update") {
            return false;
          }
          const visibility = (item.visibility ?? "all") as NewsVisibility;
          if (visibility !== "course_students") return true;
          if (actorUser?.role === "teacher") return true;
          if (!actorUser || actorUser.role !== "student") return false;
          if (
            Array.isArray(item.targetUserIds) &&
            item.targetUserIds.length > 0
          ) {
            return item.targetUserIds.includes(actorUser.id);
          }
          if (!item.targetCourseId) return false;
          return db.purchases.some(
            (purchase) =>
              purchase.userId === actorUser.id &&
              purchase.courseId === item.targetCourseId
          );
        });
        return json(res, 200, filtered);
      }

      if (path === "/api/news" && method === "POST") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, { error: "Создавать новости может только преподаватель." });
        }
        const body = (await readBody(req)) as Partial<{
          title: string;
          content: string;
          tone: NewsTone;
          highlighted: boolean;
          imageUrl: string;
          externalUrl: string;
          visibility: NewsVisibility;
          targetCourseId: string;
          targetUserIds: string[];
        }>;
        const author = db.users.find((u) => u.id === actorUser.id) ?? actorUser;
        const title = typeof body.title === "string" ? body.title.trim() : "";
        const content =
          typeof body.content === "string" ? body.content.trim() : "";
        if (!title || !content) {
          return json(res, 400, { error: "Заполните заголовок и текст новости." });
        }
        const tone: NewsTone =
          body.tone === "exam" ||
          body.tone === "achievement" ||
          body.tone === "important" ||
          body.tone === "course_update"
            ? body.tone
            : "general";
        const now = new Date().toISOString();
        const externalUrl =
          typeof body.externalUrl === "string" && body.externalUrl.trim()
            ? body.externalUrl.trim()
            : undefined;
        const visibility: NewsVisibility =
          body.visibility === "course_students" ? "course_students" : "all";
        const targetCourseId =
          typeof body.targetCourseId === "string" && body.targetCourseId.trim()
            ? body.targetCourseId.trim()
            : undefined;
        const targetUserIds = Array.isArray(body.targetUserIds)
          ? Array.from(
              new Set(
                body.targetUserIds
                  .filter((value): value is string => typeof value === "string")
                  .map((value) => value.trim())
                  .filter(Boolean)
              )
            )
          : undefined;
        if (visibility === "course_students" && !targetCourseId) {
          return json(res, 400, {
            error:
              "Для адресной публикации студентам курса укажите targetCourseId.",
          });
        }
        const item: NewsPost = {
          id: ensureId(),
          authorId: author.id,
          authorName: `${author.firstName} ${author.lastName}`.trim() || author.email,
          title,
          content,
          tone,
          highlighted: Boolean(body.highlighted),
          imageUrl:
            typeof body.imageUrl === "string" ? body.imageUrl : undefined,
          externalUrl,
          visibility,
          targetCourseId:
            visibility === "course_students" ? targetCourseId : undefined,
          targetUserIds:
            visibility === "course_students" ? targetUserIds : undefined,
          createdAt: now,
          updatedAt: now,
        };
        db.news.push(item);
        saveDb();
        return json(res, 200, item);
      }

      const newsMatch = path.match(/^\/api\/news\/([^/]+)$/);
      if (newsMatch && method === "PUT") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, { error: "Редактировать новости может только преподаватель." });
        }
        const newsId = decodeURIComponent(newsMatch[1]);
        const index = db.news.findIndex((item) => item.id === newsId);
        if (index === -1) {
          return json(res, 404, { error: "Новость не найдена." });
        }
        const patch = (await readBody(req)) as Partial<{
          title: string;
          content: string;
          tone: NewsTone;
          highlighted: boolean;
          imageUrl: string;
          externalUrl: string;
          visibility: NewsVisibility;
          targetCourseId: string;
          targetUserIds: string[];
        }>;
        const current = db.news[index];
        const nextExternalUrl =
          typeof patch.externalUrl === "string"
            ? patch.externalUrl.trim() || undefined
            : current.externalUrl;
        const nextVisibility: NewsVisibility =
          patch.visibility === "course_students"
            ? "course_students"
            : patch.visibility === "all"
            ? "all"
            : (current.visibility ?? "all");
        const nextTargetCourseId =
          typeof patch.targetCourseId === "string"
            ? patch.targetCourseId.trim() || undefined
            : current.targetCourseId;
        const nextTargetUserIds = Array.isArray(patch.targetUserIds)
          ? Array.from(
              new Set(
                patch.targetUserIds
                  .filter((value): value is string => typeof value === "string")
                  .map((value) => value.trim())
                  .filter(Boolean)
              )
            )
          : current.targetUserIds;
        if (nextVisibility === "course_students" && !nextTargetCourseId) {
          return json(res, 400, {
            error:
              "Для адресной публикации студентам курса укажите targetCourseId.",
          });
        }
        db.news[index] = {
          ...current,
          title:
            typeof patch.title === "string" && patch.title.trim()
              ? patch.title.trim()
              : current.title,
          content:
            typeof patch.content === "string" && patch.content.trim()
              ? patch.content.trim()
              : current.content,
          tone:
            patch.tone === "general" ||
            patch.tone === "exam" ||
            patch.tone === "achievement" ||
            patch.tone === "important" ||
            patch.tone === "course_update"
              ? patch.tone
              : current.tone,
          highlighted:
            typeof patch.highlighted === "boolean"
              ? patch.highlighted
              : current.highlighted,
          imageUrl:
            typeof patch.imageUrl === "string"
              ? patch.imageUrl
              : current.imageUrl,
          externalUrl: nextExternalUrl,
          visibility: nextVisibility,
          targetCourseId:
            nextVisibility === "course_students"
              ? nextTargetCourseId
              : undefined,
          targetUserIds:
            nextVisibility === "course_students"
              ? nextTargetUserIds
              : undefined,
          updatedAt: new Date().toISOString(),
        };
        saveDb();
        return json(res, 200, db.news[index]);
      }

      if (newsMatch && method === "DELETE") {
        if (!actorUser || actorUser.role !== "teacher") {
          return json(res, 403, { error: "Удалять новости может только преподаватель." });
        }
        const newsId = decodeURIComponent(newsMatch[1]);
        const index = db.news.findIndex((item) => item.id === newsId);
        if (index === -1) {
          return json(res, 404, { error: "Новость не найдена." });
        }
        db.news.splice(index, 1);
        saveDb();
        return json(res, 200, { id: newsId });
      }

      return json(res, 404, { error: "Not found" });
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : "Server error",
      });
    }
  });
}
const normalizeBnplData = (
  value: unknown,
  fallbackAmount: number,
  fallbackPurchasedAt: string,
  selectedInstallmentsCount?: number
): BnplPurchaseData => {
  if (!value || typeof value !== "object") {
    return buildBnplPurchaseSnapshot({
      amount: fallbackAmount,
      purchasedAt: fallbackPurchasedAt,
      selectedInstallmentsCount,
    });
  }
  const raw = value as {
    provider?: unknown;
    offer?: unknown;
    plan?: unknown;
    lastKnownStatus?: unknown;
    installmentsCount?: unknown;
    paidCount?: unknown;
    nextPaymentDate?: unknown;
    schedule?: unknown;
  };
  const fallback = buildBnplPurchaseSnapshot({
    amount: fallbackAmount,
    purchasedAt: fallbackPurchasedAt,
    selectedInstallmentsCount,
  });

  const planSource =
    raw.plan && typeof raw.plan === "object"
      ? (raw.plan as {
          installmentsCount?: unknown;
          paidCount?: unknown;
          nextPaymentDate?: unknown;
          schedule?: unknown;
        })
      : raw;

  const schedule = Array.isArray(planSource.schedule)
    ? planSource.schedule
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const candidate = item as {
            dueDate?: unknown;
            amount?: unknown;
            status?: unknown;
          };
          if (
            typeof candidate.dueDate !== "string" ||
            !Number.isFinite(candidate.amount) ||
            !isBnplScheduleStatus(candidate.status)
          ) {
            return null;
          }
          return {
            dueDate: candidate.dueDate,
            amount: Number(candidate.amount),
            status: candidate.status,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : fallback.plan?.schedule ?? fallback.schedule ?? [];

  const installmentsCountRaw =
    typeof planSource.installmentsCount === "number" &&
    Number.isFinite(planSource.installmentsCount)
      ? planSource.installmentsCount
      : null;
  const paidCountRaw =
    typeof planSource.paidCount === "number" &&
    Number.isFinite(planSource.paidCount)
      ? planSource.paidCount
      : null;

  const installmentsCount =
    installmentsCountRaw !== null && installmentsCountRaw > 0
      ? installmentsCountRaw
      : fallback.plan?.installmentsCount ?? fallback.installmentsCount ?? 4;
  const paidCount =
    paidCountRaw !== null && paidCountRaw >= 0
      ? paidCountRaw
      : fallback.plan?.paidCount ?? fallback.paidCount ?? 0;
  const nextPaymentDate =
    typeof planSource.nextPaymentDate === "string"
      ? planSource.nextPaymentDate
      : fallback.plan?.nextPaymentDate ?? fallback.nextPaymentDate;

  return {
    provider: isBnplProvider(raw.provider) ? raw.provider : fallback.provider,
    offer:
      raw.offer && typeof raw.offer === "object"
        ? (raw.offer as BnplPurchaseData["offer"])
        : fallback.offer,
    plan: {
      installmentsCount,
      paidCount,
      nextPaymentDate,
      schedule,
    },
    installmentsCount,
    paidCount,
    nextPaymentDate,
    schedule,
    lastKnownStatus:
      raw.lastKnownStatus === "active" ||
      raw.lastKnownStatus === "completed" ||
      raw.lastKnownStatus === "overdue" ||
      raw.lastKnownStatus === "canceled"
        ? raw.lastKnownStatus
        : fallback.lastKnownStatus ?? "active",
  };
};
