import { createContext, useContext } from "react";

export type PerformanceModeContextValue = {
  isDegraded: boolean;
  reason: "inp" | "long_task" | "mixed" | null;
  degradedUntil: string | null;
  reset: () => void;
};

const defaultValue: PerformanceModeContextValue = {
  isDegraded: false,
  reason: null,
  degradedUntil: null,
  reset: () => {},
};

export const PerformanceModeContext =
  createContext<PerformanceModeContextValue>(defaultValue);

export const usePerformanceMode = () => useContext(PerformanceModeContext);
