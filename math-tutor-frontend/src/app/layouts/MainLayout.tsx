import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Header } from "@/widgets/header/ui/Header";
import { AuthModal } from "@/features/auth/ui/AuthModal";
import { useAuth } from "@/features/auth/model/AuthContext";
import { ConnectivityBanner } from "@/shared/ui/ConnectivityBanner";
import { PerformanceModeBanner } from "@/shared/ui/PerformanceModeBanner";
import { getFirstPasswordStatus } from "@/features/auth/model/api";
import { FirstPasswordDialog } from "@/features/auth/ui/FirstPasswordDialog";

export function MainLayout() {
  const {
    user,
    isAuthReady,
    isAuthModalOpen,
    closeAuthModal,
    authModalMode,
    authModalContext,
    authModalEmail,
    authModalError,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [firstPasswordRequired, setFirstPasswordRequired] = useState(false);
  const [firstPasswordStatusError, setFirstPasswordStatusError] = useState<string | null>(
    null
  );

  const refreshFirstPasswordStatus = useCallback(async () => {
    if (!user) {
      setFirstPasswordRequired(false);
      setFirstPasswordStatusError(null);
      return;
    }
    try {
      const status = await getFirstPasswordStatus();
      setFirstPasswordRequired(status.required);
      setFirstPasswordStatusError(null);
    } catch (requestError) {
      setFirstPasswordRequired(false);
      setFirstPasswordStatusError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось проверить статус первичного пароля."
      );
    }
  }, [user]);

  useEffect(() => {
    if (!isAuthReady || !user) return;
    if (location.pathname !== "/") return;
    const state = location.state as { from?: string; authRequired?: boolean } | null;
    const from = typeof state?.from === "string" ? state.from.trim() : "";
    if (!from || !from.startsWith("/") || from.startsWith("//") || from === "/") return;
    navigate(from, { replace: true, state: null });
  }, [isAuthReady, location.pathname, location.state, navigate, user]);

  useEffect(() => {
    if (!isAuthReady) return;
    const timerId = window.setTimeout(() => {
      void refreshFirstPasswordStatus();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [isAuthReady, refreshFirstPasswordStatus, user?.id]);

  return (
    <>
      <Header />
      <ConnectivityBanner />
      <PerformanceModeBanner />
      <main className="app-main">
        <Outlet />
      </main>
      <AuthModal
        open={isAuthModalOpen}
        onClose={closeAuthModal}
        mode={authModalMode}
        context={authModalContext}
        initialEmail={authModalEmail}
        initialError={authModalError}
      />
      <FirstPasswordDialog
        open={Boolean(user) && firstPasswordRequired}
        statusError={firstPasswordStatusError}
        onCompleted={() => {
          setFirstPasswordRequired(false);
          setFirstPasswordStatusError(null);
        }}
      />
    </>
  );
}
