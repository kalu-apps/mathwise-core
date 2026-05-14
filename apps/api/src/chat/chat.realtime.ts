import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import type {
  TeacherChatMessageDto,
  TeacherChatRealtimeEventDto,
  TeacherChatRealtimeEventType,
} from "./chat.types";

type ChatThreadIdentity = {
  id: string;
  studentId: string;
  teacherId: string;
};

type ChatRealtimeListener = {
  id: string;
  userId: string;
  threadId?: string;
  emit: (event: TeacherChatRealtimeEventDto) => void;
};

type PublishEvent = {
  type: Exclude<TeacherChatRealtimeEventType, "connected" | "ping">;
  threadId: string;
  messageId?: string;
  message?: TeacherChatMessageDto;
};

type ChatRealtimeEnvelope = {
  recipients: string[];
  event: TeacherChatRealtimeEventDto;
};

const CHAT_REALTIME_CHANNEL = "chat:events:v1";
const CHAT_REALTIME_VERSION_KEY = "chat:events:version";
const CHAT_REALTIME_REPLAY_KEY = "chat:events:replay:v1";
const CHAT_REALTIME_REPLAY_LIMIT = 500;
const CHAT_REALTIME_REPLAY_TTL_SEC = 24 * 60 * 60;

const nowIso = () => new Date().toISOString();

@Injectable()
export class ChatRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatRealtimeService.name);
  private readonly listeners = new Map<string, ChatRealtimeListener>();
  private localVersion = 1;
  private unsubscribeRedis?: () => Promise<void>;

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    try {
      this.unsubscribeRedis = await this.redisService.subscribe(
        CHAT_REALTIME_CHANNEL,
        (message) => this.handleRedisMessage(message)
      );
    } catch (error) {
      this.logger.warn(
        `Chat realtime Redis subscription is unavailable: ${this.formatError(error)}`
      );
    }
  }

  async onModuleDestroy() {
    if (!this.unsubscribeRedis) return;
    try {
      await this.unsubscribeRedis();
    } catch (error) {
      this.logger.warn(
        `Chat realtime Redis unsubscribe failed: ${this.formatError(error)}`
      );
    }
  }

  subscribe(params: {
    userId: string;
    threadId?: string;
    lastEventId?: number;
    emit: (event: TeacherChatRealtimeEventDto) => void;
  }): () => void {
    const listener: ChatRealtimeListener = {
      id: `chat_listener_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`,
      userId: params.userId,
      threadId: params.threadId?.trim() || undefined,
      emit: params.emit,
    };
    this.listeners.set(listener.id, listener);

    listener.emit(
      this.buildLocalEvent({ type: "connected", threadId: listener.threadId })
    );
    if (params.lastEventId && params.lastEventId > 0) {
      void this.replayMissedEvents(listener, params.lastEventId);
    }
    const heartbeat = setInterval(() => {
      listener.emit(
        this.buildLocalEvent({ type: "ping", threadId: listener.threadId })
      );
    }, 25_000);
    heartbeat.unref?.();

    return () => {
      clearInterval(heartbeat);
      this.listeners.delete(listener.id);
    };
  }

  publishThread(thread: ChatThreadIdentity, event: PublishEvent): void {
    const recipients = new Set([thread.studentId, thread.teacherId]);
    void this.publishThreadEvent(Array.from(recipients), event);
  }

  private async publishThreadEvent(
    recipients: string[],
    event: PublishEvent
  ): Promise<void> {
    try {
      const payload: ChatRealtimeEnvelope = {
        recipients,
        event: {
          ...event,
          version: await this.redisService.increment(CHAT_REALTIME_VERSION_KEY),
          at: nowIso(),
        },
      };
      const encoded = JSON.stringify(payload);
      void this.storeReplayEvent(encoded);
      await this.redisService.publish(
        CHAT_REALTIME_CHANNEL,
        encoded
      );
    } catch (error) {
      this.logger.warn(
        `Chat realtime Redis publish failed, falling back to local delivery: ${this.formatError(
          error
        )}`
      );
      this.deliverToLocal(recipients, this.buildLocalEvent(event));
    }
  }

  private handleRedisMessage(message: string): void {
    let payload: ChatRealtimeEnvelope;
    try {
      payload = JSON.parse(message) as ChatRealtimeEnvelope;
    } catch {
      return;
    }

    if (!this.isEnvelope(payload)) return;
    this.deliverToLocal(payload.recipients, payload.event);
  }

  private async replayMissedEvents(
    listener: ChatRealtimeListener,
    lastEventId: number
  ): Promise<void> {
    try {
      const encodedEvents = await this.redisService.listRange(
        CHAT_REALTIME_REPLAY_KEY,
        0,
        CHAT_REALTIME_REPLAY_LIMIT - 1
      );
      const replayEvents = encodedEvents
        .map((encoded) => {
          try {
            return JSON.parse(encoded) as ChatRealtimeEnvelope;
          } catch {
            return null;
          }
        })
        .filter((event): event is ChatRealtimeEnvelope => Boolean(event))
        .filter((event) => this.isEnvelope(event))
        .filter((event) => event.event.version > lastEventId)
        .filter((event) => event.recipients.includes(listener.userId))
        .filter(
          (event) => !listener.threadId || listener.threadId === event.event.threadId
        )
        .sort((left, right) => left.event.version - right.event.version);

      for (const replayEvent of replayEvents) {
        if (!this.listeners.has(listener.id)) return;
        listener.emit(replayEvent.event);
      }
    } catch (error) {
      this.logger.warn(
        `Chat realtime replay failed: ${this.formatError(error)}`
      );
    }
  }

  private async storeReplayEvent(encoded: string): Promise<void> {
    try {
      await this.redisService.pushCappedList(
        CHAT_REALTIME_REPLAY_KEY,
        encoded,
        CHAT_REALTIME_REPLAY_LIMIT,
        CHAT_REALTIME_REPLAY_TTL_SEC
      );
    } catch (error) {
      this.logger.warn(
        `Chat realtime replay buffer write failed: ${this.formatError(error)}`
      );
    }
  }

  private deliverToLocal(
    recipients: string[],
    payload: TeacherChatRealtimeEventDto
  ): void {
    const recipientSet = new Set(recipients);
    for (const listener of this.listeners.values()) {
      if (!recipientSet.has(listener.userId)) continue;
      if (listener.threadId && listener.threadId !== payload.threadId) continue;
      listener.emit(payload);
    }
  }

  private buildLocalEvent(
    event:
      | PublishEvent
      | {
          type: "connected" | "ping";
          threadId?: string;
        }
  ): TeacherChatRealtimeEventDto {
    const version = this.localVersion;
    this.localVersion += 1;
    return {
      ...event,
      version,
      at: nowIso(),
    };
  }

  private isEnvelope(value: ChatRealtimeEnvelope): value is ChatRealtimeEnvelope {
    return (
      value &&
      Array.isArray(value.recipients) &&
      value.recipients.every((recipient) => typeof recipient === "string") &&
      value.event &&
      typeof value.event.type === "string" &&
      typeof value.event.version === "number" &&
      typeof value.event.at === "string"
    );
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
