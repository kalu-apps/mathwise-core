import { useCallback, useEffect, useRef, useState } from "react";
import { isRecoverableApiError } from "@/shared/api/client";
import { t } from "@/shared/i18n";
import {
  clearRetryLastAction,
  setRetryLastAction,
} from "@/shared/lib/retryLastAction";

type GuardRunOptions = {
  lockKey?: string;
  timeoutMs?: number;
  retry?: {
    id?: string;
    label?: string;
    enabled?: boolean;
  };
};

const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
const MIN_ACTION_TIMEOUT_MS = 3_000;
const MAX_ACTION_TIMEOUT_MS = 120_000;

const globalActionLocks = new Set<string>();
export const APP_ACTION_GUARD_EVENT = "app-action-guard";

type ActionGuardEventStatus =
  | "blocked_local"
  | "blocked_global"
  | "started"
  | "succeeded"
  | "failed";

export type ActionGuardEventDetail = {
  status: ActionGuardEventStatus;
  lockKey: string | null;
  timestamp: string;
};

class ActionGuardTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super(t("connectivity.actionTimeout"));
    this.name = "ActionGuardTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

const normalizeTimeoutMs = (value?: number) => {
  if (!Number.isFinite(value)) return DEFAULT_ACTION_TIMEOUT_MS;
  return Math.min(
    MAX_ACTION_TIMEOUT_MS,
    Math.max(MIN_ACTION_TIMEOUT_MS, Math.floor(value as number))
  );
};

const emitActionGuardEvent = (detail: ActionGuardEventDetail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<ActionGuardEventDetail>(APP_ACTION_GUARD_EVENT, {
        detail,
      })
    );
  } catch {
    // ignore
  }
};

export const useActionGuard = () => {
  const [pending, setPending] = useState(false);
  const localLockRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async <T>(
      action: () => Promise<T>,
      options: GuardRunOptions = {}
    ): Promise<T | undefined> => {
      const lockKey = options.lockKey?.trim();
      const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
      const retryEnabled = options.retry?.enabled !== false;
      const retryId =
        options.retry?.id?.trim() ||
        lockKey ||
        `retry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const retryLabel =
        options.retry?.label?.trim() || t("connectivity.retryLastAction");
      if (localLockRef.current) {
        emitActionGuardEvent({
          status: "blocked_local",
          lockKey: lockKey || null,
          timestamp: new Date().toISOString(),
        });
        return undefined;
      }
      if (lockKey && globalActionLocks.has(lockKey)) {
        emitActionGuardEvent({
          status: "blocked_global",
          lockKey,
          timestamp: new Date().toISOString(),
        });
        return undefined;
      }

      localLockRef.current = true;
      if (lockKey) {
        globalActionLocks.add(lockKey);
      }
      if (mountedRef.current) {
        setPending(true);
      }
      emitActionGuardEvent({
        status: "started",
        lockKey: lockKey || null,
        timestamp: new Date().toISOString(),
      });
      let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = globalThis.setTimeout(() => {
            reject(new ActionGuardTimeoutError(timeoutMs));
          }, timeoutMs);
        });
        const result = await Promise.race([action(), timeoutPromise]);
        clearRetryLastAction(retryId);
        emitActionGuardEvent({
          status: "succeeded",
          lockKey: lockKey || null,
          timestamp: new Date().toISOString(),
        });
        return result;
      } catch (error) {
        emitActionGuardEvent({
          status: "failed",
          lockKey: lockKey || null,
          timestamp: new Date().toISOString(),
        });
        const recoverable =
          isRecoverableApiError(error) || error instanceof ActionGuardTimeoutError;
        if (retryEnabled && recoverable) {
          setRetryLastAction({
            id: retryId,
            title: retryLabel,
            createdAt: new Date().toISOString(),
            run: () => run(action, { ...options, retry: { ...options.retry, enabled: false } }),
          });
        }
        throw error;
      } finally {
        if (timeoutId !== null) {
          globalThis.clearTimeout(timeoutId);
        }
        localLockRef.current = false;
        if (lockKey) {
          globalActionLocks.delete(lockKey);
        }
        if (mountedRef.current) {
          setPending(false);
        }
      }
    },
    []
  );

  return {
    pending,
    run,
  };
};
