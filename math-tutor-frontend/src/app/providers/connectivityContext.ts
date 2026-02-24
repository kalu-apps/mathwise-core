import { createContext, useContext } from "react";
import type { ApiFailureEventDetail } from "@/shared/api/client";

export type ConnectivityStatus = "online" | "offline" | "degraded";

export type ConnectivityContextValue = {
  status: ConnectivityStatus;
  isOnline: boolean;
  checking: boolean;
  lastErrorCode: ApiFailureEventDetail["code"] | null;
  recheck: () => Promise<void>;
  retryAvailable: boolean;
  retryPending: boolean;
  retryTitle: string | null;
  retryLastAction: () => Promise<void>;
  outboxPendingCount: number;
  outboxFlushing: boolean;
  outboxRetryAt: string | null;
  outboxRecoverableFailureCount: number;
  flushOutbox: () => Promise<void>;
};

const defaultValue: ConnectivityContextValue = {
  status: "online",
  isOnline: true,
  checking: false,
  lastErrorCode: null,
  recheck: async () => {},
  retryAvailable: false,
  retryPending: false,
  retryTitle: null,
  retryLastAction: async () => {},
  outboxPendingCount: 0,
  outboxFlushing: false,
  outboxRetryAt: null,
  outboxRecoverableFailureCount: 0,
  flushOutbox: async () => {},
};

export const ConnectivityContext =
  createContext<ConnectivityContextValue>(defaultValue);

export const useConnectivity = () => useContext(ConnectivityContext);
