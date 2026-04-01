import { useCallback, useEffect, useState } from "react";
import { selfHealAccess } from "./api";
import { getCourseAccessList } from "@/domain/auth-payments/model/api";
import {
  getCatalogAccessUiState,
  type AccessUiState,
} from "@/domain/auth-payments/model/ui";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";

type Params = {
  email?: string;
  role?: string;
};

export function useRecoverAccessNotice({ email, role }: Params) {
  const [state, setState] = useState<AccessUiState | null>(null);

  const recheck = useCallback(async () => {
    if (!email || role !== "student") {
      setState(null);
      return;
    }
    try {
      const access = await getCourseAccessList();
      setState(
        getCatalogAccessUiState({
          decisions: access.decisions,
          isStudent: true,
        })
      );
    } catch {
      setState(null);
    }
  }, [email, role]);

  const repair = useCallback(
    async (params?: { courseId?: string }) => {
      const result = await selfHealAccess(params);
      await recheck();
      return result;
    },
    [recheck]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void recheck();
    }, 0);
    const unsubscribe = subscribeAppDataUpdates(() => {
      void recheck();
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [recheck]);

  return { state, recheck, repair };
}
