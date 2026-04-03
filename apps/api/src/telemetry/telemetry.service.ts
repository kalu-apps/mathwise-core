import { Injectable } from "@nestjs/common";
import type { RumEventDto, RumIngestPayloadDto, RumIngestResponseDto } from "./telemetry.types";

const MAX_BATCH_SIZE = 200;

type RumCounters = {
  totalAccepted: number;
  totalDropped: number;
  perType: Record<string, number>;
  lastIngestAt: string | null;
};

const createInitialCounters = (): RumCounters => ({
  totalAccepted: 0,
  totalDropped: 0,
  perType: {},
  lastIngestAt: null,
});

const normalizeEvents = (payload: RumIngestPayloadDto): RumEventDto[] => {
  if (!Array.isArray(payload.events)) return [];
  return payload.events.slice(0, MAX_BATCH_SIZE);
};

const normalizeEventType = (value: unknown): string => {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "unknown";
};

@Injectable()
export class TelemetryService {
  private readonly counters = createInitialCounters();

  ingestRum(payload: RumIngestPayloadDto): RumIngestResponseDto {
    const events = normalizeEvents(payload);
    let accepted = 0;
    let dropped = 0;

    for (const event of events) {
      if (!event || typeof event !== "object") {
        dropped += 1;
        continue;
      }
      const type = normalizeEventType(event.type);
      this.counters.perType[type] = (this.counters.perType[type] ?? 0) + 1;
      accepted += 1;
    }

    const droppedByLimit =
      Array.isArray(payload.events) && payload.events.length > MAX_BATCH_SIZE
        ? payload.events.length - MAX_BATCH_SIZE
        : 0;
    dropped += droppedByLimit;

    this.counters.totalAccepted += accepted;
    this.counters.totalDropped += dropped;
    this.counters.lastIngestAt = new Date().toISOString();

    return {
      ok: true,
      accepted,
      dropped,
    };
  }

  snapshot() {
    return {
      ...this.counters,
      perType: { ...this.counters.perType },
    };
  }
}
