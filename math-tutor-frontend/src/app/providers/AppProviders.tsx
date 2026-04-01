import type { ReactNode } from "react";
import { ThemeModeProvider } from "@/app/theme/ThemeModeProvider";
import { AuthProvider } from "@/features/auth/model/AuthProvider";
import { ConnectivityProvider } from "./ConnectivityProvider";
import { ReconciliationRunner } from "./ReconciliationRunner";
import { PerformanceMonitoringProvider } from "./PerformanceMonitoringProvider";
import { PerformanceModeProvider } from "./PerformanceModeProvider";
import { runStorageMaintenanceSweep } from "./storageMaintenance";
import { RumReporterProvider } from "./RumReporterProvider";
import { StageAccessGateProvider } from "./StageAccessGateProvider";

if (typeof window !== "undefined") {
  runStorageMaintenanceSweep();
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PerformanceMonitoringProvider>
      <RumReporterProvider>
        <PerformanceModeProvider>
          <ThemeModeProvider>
            <ConnectivityProvider>
              <StageAccessGateProvider>
                <AuthProvider>
                  <ReconciliationRunner />
                  {children}
                </AuthProvider>
              </StageAccessGateProvider>
            </ConnectivityProvider>
          </ThemeModeProvider>
        </PerformanceModeProvider>
      </RumReporterProvider>
    </PerformanceMonitoringProvider>
  );
}
