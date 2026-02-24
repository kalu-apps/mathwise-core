import type { ReactNode } from "react";
import { PerformanceModeContext } from "./performanceModeContext";

const noop = () => {};

const stableValue = {
  isDegraded: false,
  reason: null,
  degradedUntil: null,
  reset: noop,
} as const;

export function PerformanceModeProvider({ children }: { children: ReactNode }) {
  return (
    <PerformanceModeContext.Provider value={stableValue}>
      {children}
    </PerformanceModeContext.Provider>
  );
}

