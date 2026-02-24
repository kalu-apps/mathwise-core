import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/model/AuthContext";
import { useConnectivity } from "@/app/providers/connectivityContext";
import {
  getCheckouts,
  getCheckoutStatus,
  runSupportReconciliation,
} from "@/domain/auth-payments/model/api";
import { selfHealAccess } from "@/features/auth/model/api";
import { getBookings } from "@/entities/booking/model/storage";
import { dispatchDataUpdate } from "@/shared/lib/dataUpdateBus";

const STUDENT_CHECKOUT_RECHECK_STATES = new Set([
  "created",
  "awaiting_payment",
  "paid",
  "provisioning",
]);

const RECONCILE_MIN_INTERVAL_MS = 60_000;
const RECONCILE_PERIODIC_MS = 180_000;

const notifyDataReconciled = () => {
  dispatchDataUpdate("reconciliation");
};

export function ReconciliationRunner() {
  const { user } = useAuth();
  const { status } = useConnectivity();

  const inFlightRef = useRef(false);
  const lastRunRef = useRef<{ userId: string; at: number } | null>(null);

  const shouldSkipRun = useCallback(
    (userId: string) => {
      if (inFlightRef.current) return true;
      const now = Date.now();
      if (
        lastRunRef.current &&
        lastRunRef.current.userId === userId &&
        now - lastRunRef.current.at < RECONCILE_MIN_INTERVAL_MS
      ) {
        return true;
      }
      return false;
    },
    []
  );

  const runStudentReconciliation = useCallback(async (userId: string) => {
    const [checkouts, bookings] = await Promise.all([
      getCheckouts({ userId }),
      getBookings({ studentId: userId }),
    ]);

    const recentCheckouts = checkouts
      .filter((checkout) => STUDENT_CHECKOUT_RECHECK_STATES.has(checkout.state))
      .slice(0, 12);

    const statusResults = await Promise.allSettled(
      recentCheckouts.map((checkout) => getCheckoutStatus(checkout.id))
    );

    const hasPotentialAccessGap = statusResults.some((result) => {
      if (result.status !== "fulfilled") return false;
      const accessState = result.value.access?.accessState;
      const paymentStatus = result.value.payment.status;
      return (
        paymentStatus === "paid" &&
        accessState !== undefined &&
        accessState !== "active"
      );
    });

    // Trigger safe self-heal only when we detect a plausible mismatch.
    if (hasPotentialAccessGap) {
      try {
        await selfHealAccess();
      } catch {
        // self-heal is best-effort; access gating remains authoritative
      }
    }

    return recentCheckouts.length > 0 || bookings.length > 0 || hasPotentialAccessGap;
  }, []);

  const runTeacherReconciliation = useCallback(async (userId: string) => {
    const [supportResult, bookings] = await Promise.all([
      runSupportReconciliation({
        dryRun: false,
        includeHighRisk: false,
      }),
      getBookings({ teacherId: userId }),
    ]);

    return (
      bookings.length > 0 ||
      (typeof supportResult.appliedCount === "number" &&
        supportResult.appliedCount > 0)
    );
  }, []);

  const runReconciliation = useCallback(async () => {
    if (!user) return;
    if (status !== "online") return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    if (shouldSkipRun(user.id)) return;

    inFlightRef.current = true;
    lastRunRef.current = { userId: user.id, at: Date.now() };

    try {
      const changed =
        user.role === "teacher"
          ? await runTeacherReconciliation(user.id)
          : await runStudentReconciliation(user.id);
      if (changed) {
        notifyDataReconciled();
      }
    } catch {
      // best-effort background reconciliation
    } finally {
      inFlightRef.current = false;
    }
  }, [
    runStudentReconciliation,
    runTeacherReconciliation,
    shouldSkipRun,
    status,
    user,
  ]);

  useEffect(() => {
    void runReconciliation();
  }, [runReconciliation]);

  useEffect(() => {
    if (!user || status !== "online") return undefined;
    const timer = window.setInterval(() => {
      void runReconciliation();
    }, RECONCILE_PERIODIC_MS);
    return () => window.clearInterval(timer);
  }, [runReconciliation, status, user]);

  return null;
}
