import { readStorage, writeStorage } from "@/shared/lib/localDb";

const OPENED_LESSONS_STORAGE_KEY = "OPENED_LESSONS_BY_COURSE_V1";
const OPENED_LESSONS_STORAGE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type OpenedLessonsMap = Record<string, string[]>;

const makeKey = (userId: string, courseId: string) => `${userId}:${courseId}`;

const readMap = () =>
  readStorage<OpenedLessonsMap>(OPENED_LESSONS_STORAGE_KEY, {});

const writeMap = (value: OpenedLessonsMap) =>
  writeStorage(OPENED_LESSONS_STORAGE_KEY, value, {
    ttlMs: OPENED_LESSONS_STORAGE_TTL_MS,
  });

export const getOpenedLessonIds = (userId: string, courseId: string) => {
  if (!userId || !courseId) return [];
  const map = readMap();
  const key = makeKey(userId, courseId);
  const value = map[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
};

export const markLessonOpened = (
  userId: string,
  courseId: string,
  lessonId: string
) => {
  if (!userId || !courseId || !lessonId) return;
  const map = readMap();
  const key = makeKey(userId, courseId);
  const current = Array.isArray(map[key]) ? map[key] : [];
  if (current.includes(lessonId)) return;
  map[key] = [...current, lessonId];
  writeMap(map);
};
