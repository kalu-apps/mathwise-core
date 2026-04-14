import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Header } from "@/widgets/header/ui/Header";
import { AuthModal } from "@/features/auth/ui/AuthModal";
import { useAuth } from "@/features/auth/model/AuthContext";
import { ConnectivityBanner } from "@/shared/ui/ConnectivityBanner";
import { PerformanceModeBanner } from "@/shared/ui/PerformanceModeBanner";
import { t } from "@/shared/i18n";
import { getFirstPasswordStatus } from "@/features/auth/model/api";
import { FirstPasswordDialog } from "@/features/auth/ui/FirstPasswordDialog";

const mapSocialErrorCodeToMessage = (code: string) => {
  const socialErrorMessages: Record<string, string> = {
    provider_not_supported: t("auth.socialErrorProviderUnavailable"),
    provider_disabled: t("auth.socialErrorProviderUnavailable"),
    provider_misconfigured: t("auth.socialErrorProviderUnavailable"),
    invalid_state: t("auth.socialErrorStateInvalid"),
    provider_rejected: t("auth.socialErrorProviderRejected"),
    token_exchange_failed: t("auth.socialErrorProviderFailed"),
    provider_profile_failed: t("auth.socialErrorProviderFailed"),
    profile_invalid: t("auth.socialErrorProviderFailed"),
    email_missing: t("auth.socialErrorEmailMissing"),
    email_not_verified: t("auth.socialErrorEmailNotVerified"),
    account_not_found: t("auth.socialErrorAccountNotFound"),
    identity_conflict: t("auth.socialErrorIdentityConflict"),
  };
  return socialErrorMessages[code] ?? t("auth.socialErrorDefault");
};

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
    openAuthModalWithError,
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
    const searchParams = new URLSearchParams(location.search);
    const socialErrorCode = searchParams.get("authSocialError");
    if (!socialErrorCode) return;

    openAuthModalWithError(mapSocialErrorCodeToMessage(socialErrorCode));

    searchParams.delete("authSocialError");
    searchParams.delete("authSocialProvider");
    const nextSearch = searchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
        hash: location.hash,
      },
      { replace: true, state: location.state }
    );
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
    openAuthModalWithError,
  ]);

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
