import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  APP_API_FAILURE_EVENT,
  APP_API_SUCCESS_EVENT,
  type ApiFailureEventDetail,
  type ApiSuccessEventDetail,
} from "@/shared/api/client";
import {
  ConnectivityContext,
  type ConnectivityStatus,
} from "./connectivityContext";
import {
  getRetryLastActionSnapshot,
  retryLastAction,
  subscribeRetryLastAction,
} from "@/shared/lib/retryLastAction";
import {
  flushOutboxQueue,
  getOutboxSnapshot,
  subscribeOutbox,
} from "@/shared/lib/outbox";

const HEALTHCHECK_TIMEOUT_MS = 5_000;
const AUTO_RECHECK_MS = 15_000;

const DEGRADE_CODES = new Set<ApiFailureEventDetail["code"]>([
  "timeout",
  "network_error",
  "server_unavailable",
  "circuit_open",
  "rate_limited",
]);

const getInitialStatus = (): ConnectivityStatus => {
  if (typeof navigator === "undefined") return "online";
  return navigator.onLine ? "online" : "offline";
};

const isDocumentVisible = () => {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
};

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectivityStatus>(getInitialStatus);
  const [checking, setChecking] = useState(false);
  const [lastErrorCode, setLastErrorCode] = useState<
    ApiFailureEventDetail["code"] | null
  >(null);
  const [retrySnapshot, setRetrySnapshot] = useState(() =>
    getRetryLastActionSnapshot()
  );
  const [outboxSnapshot, setOutboxSnapshot] = useState(() => getOutboxSnapshot());
  const checkingRef = useRef(false);

  const recheck = useCallback(async () => {
    if (checkingRef.current) return;
    if (typeof window === "undefined") return;

    checkingRef.current = true;
    setChecking(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      HEALTHCHECK_TIMEOUT_MS
    );

    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      });

      if (response.status >= 500) {
        setStatus("degraded");
      } else {
        setStatus("online");
        setLastErrorCode(null);
      }
    } catch {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("offline");
        setLastErrorCode("network_offline");
      } else {
        setStatus("degraded");
      }
    } finally {
      window.clearTimeout(timeoutId);
      checkingRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    setRetrySnapshot(getRetryLastActionSnapshot());
    return subscribeRetryLastAction(() => {
      setRetrySnapshot(getRetryLastActionSnapshot());
    });
  }, []);

  useEffect(() => {
    setOutboxSnapshot(getOutboxSnapshot());
    return subscribeOutbox(() => {
      setOutboxSnapshot(getOutboxSnapshot());
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOnline = () => {
      setStatus("degraded");
      void recheck();
      void flushOutboxQueue();
    };

    const handleOffline = () => {
      setStatus("offline");
      setLastErrorCode("network_offline");
    };

    const handleApiFailure = (event: Event) => {
      const detail = (event as CustomEvent<ApiFailureEventDetail>).detail;
      if (!detail) return;

      setLastErrorCode(detail.code);

      if (detail.code === "network_offline") {
        setStatus("offline");
        return;
      }

      if (DEGRADE_CODES.has(detail.code)) {
        setStatus((prev) => (prev === "offline" ? "offline" : "degraded"));
      }
    };

    const handleApiSuccess = (event: Event) => {
      const detail = (event as CustomEvent<ApiSuccessEventDetail>).detail;
      if (!detail) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      setStatus("online");
      setLastErrorCode(null);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(APP_API_FAILURE_EVENT, handleApiFailure as EventListener);
    window.addEventListener(APP_API_SUCCESS_EVENT, handleApiSuccess as EventListener);

    if (navigator.onLine) {
      void recheck();
      void flushOutboxQueue();
    }

    const handleWakeup = () => {
      if (!navigator.onLine) return;
      if (!isDocumentVisible()) return;
      void recheck();
      void flushOutboxQueue();
    };
    window.addEventListener("focus", handleWakeup);
    document.addEventListener("visibilitychange", handleWakeup);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(
        APP_API_FAILURE_EVENT,
        handleApiFailure as EventListener
      );
      window.removeEventListener(
        APP_API_SUCCESS_EVENT,
        handleApiSuccess as EventListener
      );
      window.removeEventListener("focus", handleWakeup);
      document.removeEventListener("visibilitychange", handleWakeup);
    };
  }, [recheck]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (status === "online") return undefined;

    const intervalId = window.setInterval(() => {
      if (!isDocumentVisible()) return;
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void recheck();
        void flushOutboxQueue();
      }
    }, AUTO_RECHECK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [status, recheck]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (outboxSnapshot.pendingCount <= 0) return undefined;
    if (outboxSnapshot.flushing) return undefined;
    if (!outboxSnapshot.nextRetryAt) return undefined;

    const retryAtMs = Date.parse(outboxSnapshot.nextRetryAt);
    if (!Number.isFinite(retryAtMs)) return undefined;

    const delayMs = Math.max(0, retryAtMs - Date.now());
    const timerId = window.setTimeout(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (!isDocumentVisible()) return;
      void flushOutboxQueue();
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    outboxSnapshot.pendingCount,
    outboxSnapshot.flushing,
    outboxSnapshot.nextRetryAt,
  ]);

  const contextValue = useMemo(
    () => ({
      status,
      isOnline: status === "online",
      checking,
      lastErrorCode,
      recheck,
      retryAvailable: Boolean(retrySnapshot),
      retryPending: Boolean(retrySnapshot?.pending),
      retryTitle: retrySnapshot?.title ?? null,
      retryLastAction: async () => {
        await retryLastAction();
      },
      outboxPendingCount: outboxSnapshot.pendingCount,
      outboxFlushing: outboxSnapshot.flushing,
      outboxRetryAt: outboxSnapshot.nextRetryAt,
      outboxRecoverableFailureCount: outboxSnapshot.recoverableFailureCount,
      flushOutbox: async () => {
        await flushOutboxQueue();
      },
    }),
    [status, checking, lastErrorCode, recheck, retrySnapshot, outboxSnapshot]
  );

  return (
    <ConnectivityContext.Provider value={contextValue}>
      {children}
    </ConnectivityContext.Provider>
  );
}
