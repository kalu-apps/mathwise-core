import type { ReactNode } from "react";
import { ThemeModeProvider } from "@/app/theme/ThemeModeProvider";
import { AuthProvider } from "@/features/auth/model/AuthProvider";
import { ConnectivityProvider } from "./ConnectivityProvider";
import { ReconciliationRunner } from "./ReconciliationRunner";
import { PerformanceMonitoringProvider } from "./PerformanceMonitoringProvider";
import { PerformanceModeProvider } from "./PerformanceModeProvider";
import { ToastProvider } from "@/shared/ui/ToastProvider";
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
                  <ToastProvider>
                    <ReconciliationRunner />
                    {children}
                  </ToastProvider>
                </AuthProvider>
              </StageAccessGateProvider>
            </ConnectivityProvider>
          </ThemeModeProvider>
        </PerformanceModeProvider>
      </RumReporterProvider>
    </PerformanceMonitoringProvider>
  );
}
