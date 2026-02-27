import { generateId } from "@/shared/lib/id";
import { readStorage, writeStorage } from "@/shared/lib/localDb";

export type StudyCabinetRole = "student" | "teacher";

export type StudyCabinetNote = {
  id: string;
  title: string;
  body: string;
  dueAt: string | null;
  endAt: string | null;
  remind: boolean;
  color: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

type StudyActivityByDay = Record<string, number>;

const ACTIVITY_TTL_MS = 1000 * 60 * 60 * 24 * 120;
const NOTES_TTL_MS = 1000 * 60 * 60 * 24 * 365;
const DEFAULT_NOTE_COLOR = "#f59e0b";

const ALLOWED_NOTE_COLORS = new Set([
  "#f59e0b",
  "#38bdf8",
  "#22c55e",
  "#a855f7",
  "#ef4444",
  "#f97316",
  "#14b8a6",
]);

const activityKey = (role: StudyCabinetRole, userId: string) =>
  `study-cabinet:activity:${role}:${userId}`;

const legacyActivityKeys = (role: StudyCabinetRole, userId: string) => [
  `study-cabinet:activity:${userId}`,
  `study-cabinet:activity:${userId}:${role}`,
];

const notesKey = (role: StudyCabinetRole, userId: string) =>
  `study-cabinet:notes:${role}:${userId}`;

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeMinutes = (value: unknown) => {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(",", "."))
        : typeof value === "bigint"
          ? Number(value)
          : Number.NaN;
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.round(numericValue));
};

const normalizeNoteColor = (value: unknown) => {
  if (typeof value !== "string") return DEFAULT_NOTE_COLOR;
  const normalized = value.trim().toLowerCase();
  if (ALLOWED_NOTE_COLORS.has(normalized)) return normalized;
  return DEFAULT_NOTE_COLOR;
};

export const getStudyCabinetActivity = (
  role: StudyCabinetRole,
  userId: string
): StudyActivityByDay => {
  if (!userId) return {};
  const primaryKey = activityKey(role, userId);
  const primary = readStorage<StudyActivityByDay>(primaryKey, {});
  const normalizedPrimary = Object.entries(primary).reduce<StudyActivityByDay>((acc, [key, value]) => {
    const minutes = normalizeMinutes(value);
    if (minutes > 0) {
      acc[key] = minutes;
    }
    return acc;
  }, {});
  const normalizedLegacy = legacyActivityKeys(role, userId).reduce<StudyActivityByDay>(
    (acc, key) => {
      const legacyData = readStorage<StudyActivityByDay>(key, {});
      Object.entries(legacyData).forEach(([dayKey, minutes]) => {
        const normalizedMinutes = normalizeMinutes(minutes);
        if (normalizedMinutes <= 0) return;
        if (dayKey in acc) return;
        acc[dayKey] = normalizedMinutes;
      });
      return acc;
    },
    {}
  );
  const merged = {
    ...normalizedLegacy,
    ...normalizedPrimary,
  };
  const mergedKeys = Object.keys(merged);
  if (
    mergedKeys.length > 0 &&
    JSON.stringify(merged) !== JSON.stringify(normalizedPrimary)
  ) {
    writeStorage(primaryKey, merged, { ttlMs: ACTIVITY_TTL_MS });
  }
  return merged;
};

export const recordStudyCabinetActivity = (params: {
  role: StudyCabinetRole;
  userId: string;
  minutes: number;
  at?: Date;
}) => {
  const { role, userId } = params;
  const minutes = normalizeMinutes(params.minutes);
  if (!userId || minutes <= 0) return;
  const key = toDateKey(params.at ?? new Date());
  const current = getStudyCabinetActivity(role, userId);
  current[key] = normalizeMinutes((current[key] ?? 0) + minutes);
  writeStorage(activityKey(role, userId), current, { ttlMs: ACTIVITY_TTL_MS });
};

export const buildStudyCabinetWeekActivity = (
  role: StudyCabinetRole,
  userId: string,
  anchorDate = new Date()
) => {
  const labels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const byDay = getStudyCabinetActivity(role, userId);
  const anchor = new Date(anchorDate);
  anchor.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() - (6 - index));
    const key = toDateKey(date);
    const dayIndex = (date.getDay() + 6) % 7;
    return {
      key,
      label: labels[dayIndex],
      minutes: normalizeMinutes(byDay[key] ?? 0),
    };
  });
};

export const getStudyCabinetNotes = (
  role: StudyCabinetRole,
  userId: string
): StudyCabinetNote[] => {
  if (!userId) return [];
  const raw = readStorage<StudyCabinetNote[]>(notesKey(role, userId), []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: String(entry.id ?? generateId()),
      title: String(entry.title ?? "").trim(),
      body: String(entry.body ?? "").trim(),
      dueAt:
        entry.dueAt && !Number.isNaN(new Date(entry.dueAt).getTime())
          ? entry.dueAt
          : null,
      endAt:
        entry.endAt &&
        !Number.isNaN(new Date(entry.endAt).getTime()) &&
        entry.dueAt &&
        !Number.isNaN(new Date(entry.dueAt).getTime()) &&
        new Date(entry.endAt).getTime() > new Date(entry.dueAt).getTime()
          ? entry.endAt
          : null,
      remind: Boolean(entry.remind),
      color: normalizeNoteColor(entry.color),
      done: Boolean(entry.done),
      createdAt: entry.createdAt ?? new Date().toISOString(),
      updatedAt: entry.updatedAt ?? new Date().toISOString(),
    }))
    .filter((entry) => entry.title.length > 0)
    .sort((a, b) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (aDue !== bDue) return aDue - bDue;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
};

const persistNotes = (
  role: StudyCabinetRole,
  userId: string,
  notes: StudyCabinetNote[]
) => {
  if (!userId) return;
  writeStorage(notesKey(role, userId), notes, { ttlMs: NOTES_TTL_MS });
};

export const createStudyCabinetNote = (params: {
  role: StudyCabinetRole;
  userId: string;
  title: string;
  body?: string;
  dueAt?: string | null;
  endAt?: string | null;
  remind?: boolean;
  color?: string;
}) => {
  const { role, userId } = params;
  const title = params.title.trim();
  if (!userId || !title) return;
  const notes = getStudyCabinetNotes(role, userId);
  const now = new Date().toISOString();
  notes.unshift({
    id: generateId(),
    title,
    body: (params.body ?? "").trim(),
    dueAt:
      params.dueAt && !Number.isNaN(new Date(params.dueAt).getTime())
        ? params.dueAt
        : null,
    endAt:
      params.endAt &&
      !Number.isNaN(new Date(params.endAt).getTime()) &&
      params.dueAt &&
      !Number.isNaN(new Date(params.dueAt).getTime()) &&
      new Date(params.endAt).getTime() > new Date(params.dueAt).getTime()
        ? params.endAt
        : null,
    remind: Boolean(params.remind),
    color: normalizeNoteColor(params.color),
    done: false,
    createdAt: now,
    updatedAt: now,
  });
  persistNotes(role, userId, notes);
};

export const toggleStudyCabinetNoteDone = (params: {
  role: StudyCabinetRole;
  userId: string;
  noteId: string;
}) => {
  const { role, userId, noteId } = params;
  if (!userId || !noteId) return;
  const notes = getStudyCabinetNotes(role, userId).map((note) =>
    note.id === noteId
      ? { ...note, done: !note.done, updatedAt: new Date().toISOString() }
      : note
  );
  persistNotes(role, userId, notes);
};

export const deleteStudyCabinetNote = (params: {
  role: StudyCabinetRole;
  userId: string;
  noteId: string;
}) => {
  const { role, userId, noteId } = params;
  if (!userId || !noteId) return;
  const notes = getStudyCabinetNotes(role, userId).filter((note) => note.id !== noteId);
  persistNotes(role, userId, notes);
};

export const updateStudyCabinetNote = (params: {
  role: StudyCabinetRole;
  userId: string;
  noteId: string;
  title: string;
  body?: string;
  dueAt?: string | null;
  endAt?: string | null;
  remind?: boolean;
  color?: string;
}) => {
  const { role, userId, noteId } = params;
  const title = params.title.trim();
  if (!userId || !noteId || !title) return;
  const notes = getStudyCabinetNotes(role, userId).map((note) => {
    if (note.id !== noteId) return note;
    return {
      ...note,
      title,
      body: (params.body ?? "").trim(),
      dueAt:
        params.dueAt && !Number.isNaN(new Date(params.dueAt).getTime())
          ? params.dueAt
          : null,
      endAt:
        params.endAt &&
        !Number.isNaN(new Date(params.endAt).getTime()) &&
        params.dueAt &&
        !Number.isNaN(new Date(params.dueAt).getTime()) &&
        new Date(params.endAt).getTime() > new Date(params.dueAt).getTime()
          ? params.endAt
          : null,
      remind: Boolean(params.remind),
      color: normalizeNoteColor(params.color),
      updatedAt: new Date().toISOString(),
    };
  });
  persistNotes(role, userId, notes);
};

export const countDueSoonStudyCabinetReminders = (
  notes: StudyCabinetNote[],
  windowMinutes = 90
) => {
  const now = Date.now();
  const windowMs = Math.max(1, Math.floor(windowMinutes)) * 60 * 1000;
  return notes.filter((note) => {
    if (note.done || !note.remind || !note.dueAt) return false;
    const dueMs = new Date(note.dueAt).getTime();
    if (Number.isNaN(dueMs)) return false;
    return dueMs - now <= windowMs && dueMs - now >= -windowMs;
  }).length;
};
