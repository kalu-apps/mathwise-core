import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AuthContext } from "./AuthContext";
import type { User } from "@/entities/user/model/types";
import { readStorage, removeStorage, writeStorage } from "@/shared/lib/localDb";
import {
  AUTH_IDLE_ACTIVITY_KEY,
  AUTH_IDLE_ACTIVITY_THROTTLE_MS,
  AUTH_IDLE_TIMEOUT_MS,
  AUTH_STORAGE_KEY,
  AUTH_STORAGE_TTL_MS,
} from "./constants";
import {
  confirmMagicLink,
  getAuthSession,
  logoutAuthSession,
  requestMagicLink,
  requestPasswordLogin,
} from "./api";
import { ApiError } from "@/shared/api/client";
import { t } from "@/shared/i18n";

const blurActiveElement = () => {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
};

const readIdleActivityTimestamp = () => {
  if (typeof localStorage === "undefined") return null;
  try {
    const rawValue = localStorage.getItem(AUTH_IDLE_ACTIVITY_KEY);
    if (!rawValue) return null;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

const writeIdleActivityTimestamp = (timestamp: number) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUTH_IDLE_ACTIVITY_KEY, String(timestamp));
  } catch {
    // ignore storage errors in reliability mode
  }
};

const clearIdleActivityTimestamp = () => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(AUTH_IDLE_ACTIVITY_KEY);
  } catch {
    // ignore storage errors in reliability mode
  }
};

const SHOWCASE_AUTO_LOGIN_EMAIL =
  import.meta.env.VITE_SHOWCASE_AUTO_LOGIN_EMAIL?.trim().toLowerCase() ?? "";
const SHOWCASE_AUTO_LOGIN_PASSWORD =
  import.meta.env.VITE_SHOWCASE_AUTO_LOGIN_PASSWORD ?? "magic";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() =>
    readStorage<User | null>(AUTH_STORAGE_KEY, null)
  );
  const [isAuthReady, setAuthReady] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number | null>(null);
  const lastPersistedActivityRef = useRef<number>(0);
  const autoLogoutInProgressRef = useRef(false);

  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "recover">("login");
  const [authModalEmail, setAuthModalEmail] = useState("");
  const showcaseAutoLoginStartedRef = useRef(false);

  const syncSession = useCallback(async () => {
    try {
      const sessionUser = await getAuthSession();
      setUser(sessionUser);
      if (sessionUser) {
        writeStorage(AUTH_STORAGE_KEY, sessionUser, { ttlMs: AUTH_STORAGE_TTL_MS });
      } else {
        removeStorage(AUTH_STORAGE_KEY);
      }
    } catch {
      setUser(null);
      removeStorage(AUTH_STORAGE_KEY);
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getAuthSession()
      .then((sessionUser) => {
        if (!active) return;
        setUser(sessionUser);
        if (sessionUser) {
          writeStorage(AUTH_STORAGE_KEY, sessionUser, { ttlMs: AUTH_STORAGE_TTL_MS });
        } else {
          removeStorage(AUTH_STORAGE_KEY);
        }
        setAuthReady(true);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        removeStorage(AUTH_STORAGE_KEY);
        setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!SHOWCASE_AUTO_LOGIN_EMAIL) return;
    if (!isAuthReady || user) return;
    if (showcaseAutoLoginStartedRef.current) return;
    showcaseAutoLoginStartedRef.current = true;
    let cancelled = false;
    const autoLogin = async () => {
      try {
        const safeUser = await requestPasswordLogin(
          SHOWCASE_AUTO_LOGIN_EMAIL,
          SHOWCASE_AUTO_LOGIN_PASSWORD
        );
        if (cancelled) return;
        setUser(safeUser);
        writeStorage(AUTH_STORAGE_KEY, safeUser, { ttlMs: AUTH_STORAGE_TTL_MS });
      } catch {
        if (cancelled) return;
        showcaseAutoLoginStartedRef.current = false;
        await syncSession();
      }
    };
    void autoLogin();
    return () => {
      cancelled = true;
    };
  }, [isAuthReady, syncSession, user]);

  const logout = useCallback(() => {
    setUser(null);
    removeStorage(AUTH_STORAGE_KEY);
    clearIdleActivityTimestamp();
    void logoutAuthSession();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const clearIdleTimer = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    if (!user) {
      clearIdleTimer();
      lastActivityRef.current = null;
      lastPersistedActivityRef.current = 0;
      autoLogoutInProgressRef.current = false;
      return;
    }

    const triggerAutoLogout = () => {
      if (autoLogoutInProgressRef.current) return;
      autoLogoutInProgressRef.current = true;
      logout();
    };

    const scheduleIdleLogout = () => {
      clearIdleTimer();
      const lastActivityTs = lastActivityRef.current ?? Date.now();
      const elapsedMs = Date.now() - lastActivityTs;
      const remainingMs = AUTH_IDLE_TIMEOUT_MS - elapsedMs;
      if (remainingMs <= 0) {
        triggerAutoLogout();
        return;
      }
      idleTimerRef.current = window.setTimeout(triggerAutoLogout, remainingMs);
    };

    const persistActivity = (timestamp: number, force = false) => {
      if (
        !force &&
        timestamp - lastPersistedActivityRef.current < AUTH_IDLE_ACTIVITY_THROTTLE_MS
      ) {
        return;
      }
      writeIdleActivityTimestamp(timestamp);
      lastPersistedActivityRef.current = timestamp;
    };

    const markActivity = (forcePersist = false) => {
      const timestamp = Date.now();
      lastActivityRef.current = timestamp;
      persistActivity(timestamp, forcePersist);
      scheduleIdleLogout();
    };

    const storedLastActivity = readIdleActivityTimestamp();
    if (
      storedLastActivity &&
      Date.now() - storedLastActivity > AUTH_IDLE_TIMEOUT_MS
    ) {
      triggerAutoLogout();
      return;
    }

    lastActivityRef.current = storedLastActivity ?? Date.now();
    persistActivity(lastActivityRef.current, true);
    scheduleIdleLogout();

    const onActivity = () => {
      markActivity(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markActivity(true);
      }
    };

    const onStorageChange = (event: StorageEvent) => {
      if (event.key === AUTH_IDLE_ACTIVITY_KEY) {
        const externalTimestamp = readIdleActivityTimestamp();
        if (!externalTimestamp) return;
        lastActivityRef.current = externalTimestamp;
        scheduleIdleLogout();
        return;
      }
      if (event.key === AUTH_STORAGE_KEY && event.newValue === null) {
        clearIdleTimer();
        setUser(null);
        removeStorage(AUTH_STORAGE_KEY);
      }
    };

    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("wheel", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("storage", onStorageChange);

    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("touchstart", onActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorageChange);
      clearIdleTimer();
    };
  }, [logout, user]);

  /* ================= LOGIN ================= */

  const requestLoginCode = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return {
        ok: false,
        error: t("auth.emailRequired"),
      };
    }

    try {
      const response = await requestMagicLink(normalizedEmail);
      if (!response.ok) {
        return {
          ok: false,
          error: response.message || t("auth.loginFailed"),
        };
      }
      return {
        ok: true,
        message: response.message,
        debugCode: response.debugCode ?? null,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : t("auth.loginFailed"),
      };
    }
  };

  const confirmLoginCode = async (email: string, code: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();
    if (!normalizedEmail || !normalizedCode) {
      return {
        ok: false,
        error: t("auth.magicCodeRequired"),
      };
    }
    try {
      const safeUser = await confirmMagicLink(normalizedEmail, normalizedCode);
      setUser(safeUser);
      writeStorage(AUTH_STORAGE_KEY, safeUser, { ttlMs: AUTH_STORAGE_TTL_MS });
      setAuthModalOpen(false);
      return { ok: true };
    } catch (error) {
      await syncSession();
      return {
        ok: false,
        error: error instanceof Error ? error.message : t("auth.loginFailed"),
      };
    }
  };

  const loginWithPassword = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.normalize("NFKC");
    if (!normalizedEmail || !normalizedPassword) {
      return {
        ok: false,
        error: t("auth.passwordRequired"),
      };
    }

    try {
      const safeUser = await requestPasswordLogin(normalizedEmail, normalizedPassword);
      setUser(safeUser);
      writeStorage(AUTH_STORAGE_KEY, safeUser, { ttlMs: AUTH_STORAGE_TTL_MS });
      setAuthModalOpen(false);
      return { ok: true };
    } catch (error) {
      await syncSession();
      if (error instanceof ApiError) {
        const details = error.details as
          | { code?: string; lockedUntil?: string | null; error?: string }
          | undefined;
        return {
          ok: false,
          error: details?.error ?? error.message ?? t("auth.loginFailed"),
          code: details?.code,
          lockedUntil: details?.lockedUntil ?? null,
        };
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : t("auth.loginFailed"),
      };
    }
  };

  const updateUser = (nextUser: User) => {
    setUser(nextUser);
    writeStorage(AUTH_STORAGE_KEY, nextUser, { ttlMs: AUTH_STORAGE_TTL_MS });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthReady,
        requestLoginCode,
        confirmLoginCode,
        loginWithPassword,
        updateUser,
        logout,
        isAuthModalOpen,
        authModalMode,
        authModalEmail,
        openAuthModal: () => {
          blurActiveElement();
          setAuthModalMode("login");
          setAuthModalEmail("");
          setAuthModalOpen(true);
        },
        openRecoverModal: (email?: string) => {
          blurActiveElement();
          setAuthModalMode("recover");
          setAuthModalEmail(email?.trim().toLowerCase() ?? "");
          setAuthModalOpen(true);
        },
        closeAuthModal: () => {
          setAuthModalOpen(false);
          setAuthModalMode("login");
          setAuthModalEmail("");
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
