import crypto from "node:crypto";
import type { BookingMaterialDto } from "./bookings.types";

export const IDEMPOTENCY_TTL_SEC = 12 * 60 * 60;
export const LOCK_TTL_SEC = 15;

export const nowIso = () => new Date().toISOString();

export const ensureId = (prefix: string) => {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizeEmail = (value: string | undefined | null) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizePhone = (value: string | undefined | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const toMinutes = (value: string) => {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN;
  return hours * 60 + minutes;
};

export const hasValidTimeRange = (startTime: string, endTime: string) => {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
};

export const toStartTimestamp = (date: string, startTime: string) =>
  new Date(`${date}T${startTime}`).getTime();

export const isFutureDateTime = (date: string, startTime: string) => {
  const timestamp = toStartTimestamp(date, startTime);
  return Number.isFinite(timestamp) && timestamp > Date.now();
};

export const normalizeMaterials = (value: unknown): BookingMaterialDto[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      const type =
        raw.type === "pdf" || raw.type === "doc" || raw.type === "video"
          ? raw.type
          : null;
      const url = typeof raw.url === "string" ? raw.url.trim() : "";
      if (!id || !name || !type || !url) return null;
      return { id, name, type, url } as BookingMaterialDto;
    })
    .filter((item): item is BookingMaterialDto => Boolean(item));
};

export const asErrorCode = (error: unknown) => {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
};

export const isPgUniqueViolation = (error: unknown) => asErrorCode(error) === "23505";

export const lockToken = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
