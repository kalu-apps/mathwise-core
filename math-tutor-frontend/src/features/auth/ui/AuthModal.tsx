import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import { t } from "@/shared/i18n";
import { ButtonPending } from "@/shared/ui/loading";
import type { AuthModalContext } from "@/features/auth/model/authUiStore";
import {
  buildSocialLoginStartUrl,
  getOauthWidgetConfig,
  type OauthWidgetConfigResponse,
  requestPasswordReset,
  resetPasswordWithRecoveryToken,
  verifyPasswordResetCode,
  type SocialProvider,
} from "@/features/auth/model/api";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  context?: AuthModalContext;
  mode?: "login" | "recover";
  initialEmail?: string;
  initialError?: string | null;
}

type ViewMode = "login" | "recover";
type RecoveryStep = 1 | 2 | 3;

type FlowMeta = {
  loginTitle: string;
  loginSubtitle: string;
  recoverTitle: string;
};

const blurActiveElement = () => {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
};

const normalizeEmailInput = (value: string) => value.trim().toLowerCase();

const validatePasswordPolicy = (password: string): string | null => {
  if (password.length < 10) {
    return t("auth.passwordResetPasswordTooShort");
  }
  if (password.length > 64) {
    return t("auth.passwordPolicyTooLong");
  }
  if (/\s/.test(password)) {
    return t("auth.passwordPolicyNoSpaces");
  }
  if (!/^[\x21-\x7E]+$/.test(password)) {
    return t("auth.passwordPolicyAsciiOnly");
  }
  if (!/[a-z]/.test(password)) {
    return t("auth.passwordPolicyNeedLower");
  }
  if (!/[A-Z]/.test(password)) {
    return t("auth.passwordPolicyNeedUpper");
  }
  if (!/\d/.test(password)) {
    return t("auth.passwordPolicyNeedDigit");
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return t("auth.passwordPolicyNeedSpecial");
  }
  return null;
};

const mapSocialButton = (provider: SocialProvider) => {
  if (provider === "vk") {
    return {
      label: t("auth.socialVk"),
      compactLabel: "VK ID",
      className: "auth-modal__social-btn--vk",
    };
  }
  if (provider === "yandex") {
    return {
      label: t("auth.socialYandex"),
      compactLabel: "Яндекс ID",
      className: "auth-modal__social-btn--yandex",
    };
  }
  return {
    label: t("auth.socialGoogle"),
    compactLabel: "Google",
    className: "auth-modal__social-btn--google",
  };
};

const SocialProviderMark = ({ provider }: { provider: SocialProvider }) => {
  if (provider === "google") {
    return (
      <svg
        className="auth-modal__social-brand auth-modal__social-brand--google"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="#EA4335"
          d="M12 10.18v3.96h5.49c-.24 1.27-.96 2.35-2.04 3.08l3.3 2.55c1.92-1.77 3.03-4.38 3.03-7.5 0-.72-.06-1.41-.2-2.09z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 4.96-.89 6.61-2.43l-3.3-2.55c-.92.62-2.1.99-3.31.99-2.55 0-4.7-1.72-5.47-4.03L3.12 16.6C4.77 19.88 8.15 22 12 22z"
        />
        <path
          fill="#FBBC05"
          d="M6.53 13.98a5.98 5.98 0 0 1-.3-1.98c0-.69.11-1.35.3-1.98L3.12 7.4A9.97 9.97 0 0 0 2 12c0 1.64.39 3.2 1.12 4.6z"
        />
        <path
          fill="#4285F4"
          d="M12 5.99c1.47 0 2.79.51 3.83 1.51l2.87-2.87C16.96 2.99 14.7 2 12 2 8.15 2 4.77 4.12 3.12 7.4l3.41 2.62c.77-2.31 2.92-4.03 5.47-4.03z"
        />
      </svg>
    );
  }
  if (provider === "vk") {
    return (
      <svg
        className="auth-modal__social-brand auth-modal__social-brand--vk"
        viewBox="0 0 448 512"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M75.6 168.3l51.1 0c1.7 85.5 39.4 121.7 69.3 129.2l0-129.2 48.2 0 0 73.7c29.5-3.2 60.5-36.8 70.9-73.7l48.2 0c-3.9 19.2-11.8 37.3-23.1 53.3s-25.7 29.5-42.5 39.6c18.7 9.3 35.2 22.4 48.4 38.5s22.9 34.9 28.3 55l-53 0c-4.9-17.5-14.8-33.1-28.6-45s-30.7-19.4-48.7-21.6l0 66.6-5.8 0c-102.1 0-160.3-70-162.8-186.5z"
        />
      </svg>
    );
  }
  return (
    <svg
      className="auth-modal__social-brand auth-modal__social-brand--yandex"
      viewBox="0 0 256 512"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M153.1 315.8L65.7 512 2 512 98 302.2C52.9 279.3 22.8 237.8 22.8 161.1 22.7 53.7 90.8 0 171.7 0l82.3 0 0 512-55.1 0 0-196.2-45.8 0zM198.9 46.5l-29.4 0c-44.4 0-87.4 29.4-87.4 114.6 0 82.3 39.4 108.8 87.4 108.8l29.4 0 0-223.4z"
      />
    </svg>
  );
};

const parseRecoveryCode = (value: string) => value.replace(/\D+/g, "").slice(0, 6);

const flowMetaByContext: Record<AuthModalContext, FlowMeta> = {
  general: {
    loginTitle: "Вход в личный кабинет",
    loginSubtitle: "",
    recoverTitle: "Восстановление пароля",
  },
  course: {
    loginTitle: "Вход перед оплатой",
    loginSubtitle: "Подтвердите аккаунт, чтобы завершить checkout.",
    recoverTitle: "Восстановление перед оплатой",
  },
  booking: {
    loginTitle: "Вход для подтверждения записи",
    loginSubtitle: "После входа запись продолжится автоматически.",
    recoverTitle: "Восстановление доступа к записи",
  },
  invite: {
    loginTitle: "Вход по приглашению",
    loginSubtitle: "Подтвердите аккаунт, чтобы принять приглашение.",
    recoverTitle: "Восстановление по приглашению",
  },
};

const recoveryStageMeta: Record<RecoveryStep, { title: string; subtitle: string }> = {
  1: {
    title: "Проверьте email",
    subtitle: "Отправим код подтверждения.",
  },
  2: {
    title: "Введите код",
    subtitle: "Код из письма содержит 6 цифр.",
  },
  3: {
    title: "Создайте новый пароль",
    subtitle: "Сохраните новый пароль для входа.",
  },
};

export function AuthModal({
  open,
  onClose,
  context = "general",
  mode = "login",
  initialEmail = "",
  initialError = null,
}: AuthModalProps) {
  const { loginWithPassword } = useAuth();
  const showAuthDebug = import.meta.env.DEV;

  const [viewMode, setViewMode] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [socialLoadingProvider, setSocialLoadingProvider] = useState<SocialProvider | null>(
    null
  );
  const [oauthWidgetConfig, setOauthWidgetConfig] = useState<OauthWidgetConfigResponse | null>(
    null
  );
  const [oauthWidgetConfigLoaded, setOauthWidgetConfigLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [recoverStep, setRecoverStep] = useState<RecoveryStep>(1);
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverCode, setRecoverCode] = useState("");
  const [recoverToken, setRecoverToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const [recoverMessage, setRecoverMessage] = useState<string | null>(null);
  const [recoverSeverity, setRecoverSeverity] = useState<
    "success" | "info" | "warning" | "error"
  >("info");
  const [recoverDebugCode, setRecoverDebugCode] = useState<string | null>(null);

  const normalizedEmail = normalizeEmailInput(email);
  const socialProviders = useMemo<SocialProvider[]>(
    () => ["vk", "yandex", "google"],
    []
  );
  const providerConfigByKey = useMemo(() => {
    const byKey: Partial<Record<SocialProvider, OauthWidgetConfigResponse["providers"][number]>> =
      {};
    oauthWidgetConfig?.providers.forEach((provider) => {
      byKey[provider.provider] = provider;
    });
    return byKey;
  }, [oauthWidgetConfig]);
  const flowMeta = flowMetaByContext[context];
  const recoverStage = recoveryStageMeta[recoverStep];
  const subtitleText = viewMode === "login" ? flowMeta.loginSubtitle : recoverStage.subtitle;
  useEffect(() => {
    if (!open) return;
    setViewMode(mode === "recover" ? "recover" : "login");
    setEmail(initialEmail);
    setPassword("");
    setShowPassword(false);
    setSubmitLoading(false);
    setSocialLoadingProvider(null);
    setOauthWidgetConfig(null);
    setOauthWidgetConfigLoaded(false);
    setError(initialError ?? null);
    setInfoMessage(null);

    setRecoverStep(1);
    setRecoverLoading(false);
    setRecoverCode("");
    setRecoverToken("");
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setRecoverError(null);
    setRecoverMessage(null);
    setRecoverSeverity("info");
    setRecoverDebugCode(null);
  }, [initialEmail, initialError, mode, open]);

  const handleDialogClose = useCallback(() => {
    blurActiveElement();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open || viewMode !== "login") return;
    let cancelled = false;
    setOauthWidgetConfigLoaded(false);
    getOauthWidgetConfig()
      .then((payload) => {
        if (cancelled) return;
        setOauthWidgetConfig(payload);
        setOauthWidgetConfigLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOauthWidgetConfig(null);
        setOauthWidgetConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, viewMode]);

  const passwordVisibilityAdornment = (
    visible: boolean,
    onToggle: () => void,
    ariaLabel: string
  ) => (
    <InputAdornment position="end">
      <IconButton
        className="auth-modal__visibility-btn"
        onClick={onToggle}
        edge="end"
        size="small"
        aria-label={ariaLabel}
      >
        {visible ? (
          <VisibilityOffRoundedIcon fontSize="small" />
        ) : (
          <VisibilityRoundedIcon fontSize="small" />
        )}
      </IconButton>
    </InputAdornment>
  );

  const handlePasswordLogin = async () => {
    setError(null);
    setInfoMessage(null);

    if (!normalizedEmail) {
      setError(t("auth.emailRequired"));
      return;
    }
    if (!password) {
      setError(t("auth.passwordRequired"));
      return;
    }

    setSubmitLoading(true);
    try {
      const result = await loginWithPassword(normalizedEmail, password);
      if (!result.ok) {
        if (result.code === "password_locked" && result.lockedUntil) {
          const until = new Date(result.lockedUntil).toLocaleString("ru-RU");
          setError(`${result.error} ${t("auth.passwordLockedUntil", { until })}`);
        } else {
          setError(result.error ?? t("auth.loginFailed"));
        }
        return;
      }
      handleDialogClose();
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSocialLogin = (provider: SocialProvider) => {
    setError(null);
    setInfoMessage(null);
    setSocialLoadingProvider(provider);
    const redirectPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(buildSocialLoginStartUrl(provider, redirectPath));
  };

  const handleRequestRecoveryCode = async () => {
    setRecoverError(null);
    setRecoverMessage(null);
    setRecoverDebugCode(null);

    if (!normalizedEmail) {
      setRecoverError(t("auth.emailRequired"));
      return;
    }

    try {
      setRecoverLoading(true);
      const result = await requestPasswordReset(normalizedEmail);
      setRecoverSeverity("success");
      setRecoverMessage(result.message || t("auth.passwordResetRequestAccepted"));
      setRecoverDebugCode(showAuthDebug ? (result.debugCode ?? null) : null);
      setRecoverStep(2);
    } catch (requestError) {
      setRecoverError(
        requestError instanceof Error
          ? requestError.message
          : t("auth.passwordResetRequestFailed")
      );
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleVerifyRecoveryCode = async () => {
    setRecoverError(null);
    setRecoverMessage(null);

    if (!normalizedEmail) {
      setRecoverError(t("auth.emailRequired"));
      return;
    }
    if (recoverCode.trim().length !== 6) {
      setRecoverError(t("auth.passwordResetTokenInvalid"));
      return;
    }

    try {
      setRecoverLoading(true);
      const result = await verifyPasswordResetCode({
        email: normalizedEmail,
        token: recoverCode,
      });
      if (!result.ok || !result.recoveryToken) {
        setRecoverError(result.message || t("auth.passwordResetTokenInvalid"));
        return;
      }
      setRecoverToken(result.recoveryToken);
      setRecoverSeverity("success");
      setRecoverMessage(t("auth.recoveryCodeVerified"));
      setRecoverStep(3);
    } catch (verifyError) {
      setRecoverError(
        verifyError instanceof Error ? verifyError.message : t("auth.passwordResetTokenInvalid")
      );
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleSaveNewPassword = async () => {
    setRecoverError(null);
    setRecoverMessage(null);

    if (!normalizedEmail || !recoverToken) {
      setRecoverError(t("auth.passwordResetFieldsRequired"));
      return;
    }

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setRecoverError(policyError);
      return;
    }

    if (!confirmPassword) {
      setRecoverError(t("auth.passwordResetConfirmRequired"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setRecoverError(t("auth.passwordResetConfirmMismatch"));
      return;
    }

    try {
      setRecoverLoading(true);
      const result = await resetPasswordWithRecoveryToken({
        email: normalizedEmail,
        recoveryToken: recoverToken,
        newPassword,
      });
      if (!result.ok) {
        setRecoverError(result.message || t("auth.passwordResetRequestFailed"));
        return;
      }
      setViewMode("login");
      setPassword("");
      setRecoverStep(1);
      setRecoverCode("");
      setRecoverToken("");
      setNewPassword("");
      setConfirmPassword("");
      setRecoverDebugCode(null);
      setInfoMessage(t("auth.passwordResetDoneLogin"));
    } catch (resetError) {
      setRecoverError(
        resetError instanceof Error ? resetError.message : t("auth.passwordResetRequestFailed")
      );
    } finally {
      setRecoverLoading(false);
    }
  };

  const openRecovery = () => {
    setViewMode("recover");
    setRecoverStep(1);
    setRecoverCode("");
    setRecoverToken("");
    setNewPassword("");
    setConfirmPassword("");
    setRecoverError(null);
    setRecoverMessage(null);
    setRecoverDebugCode(null);
    setError(null);
    setInfoMessage(null);
  };

  const openLogin = () => {
    setViewMode("login");
    setRecoverStep(1);
    setRecoverError(null);
    setRecoverMessage(null);
    setRecoverDebugCode(null);
  };

  const handleRecoverStepBack = () => {
    setRecoverStep((prev) => (prev > 1 ? ((prev - 1) as RecoveryStep) : prev));
    setRecoverError(null);
    setRecoverMessage(null);
  };

  const socialButtons = socialProviders.map((provider) => {
    const social = mapSocialButton(provider);
    const providerConfig = providerConfigByKey[provider];
    const providerOauthEnabled = providerConfig?.oauthEnabled ?? true;
    const providerWidgetReady = providerConfig?.ready ?? false;
    const providerDisabled =
      Boolean(socialLoadingProvider) ||
      (oauthWidgetConfigLoaded && !providerOauthEnabled);
    return (
      <Button
        key={provider}
        type="button"
        variant="outlined"
        className={`auth-modal__social-btn ${social.className} ${
          providerWidgetReady ? "auth-modal__social-btn--official-ready" : ""
        }`}
        onClick={() => handleSocialLogin(provider)}
        disabled={providerDisabled}
        aria-label={social.label}
        data-oauth-provider={provider}
        data-oauth-widget-ready={providerWidgetReady ? "true" : "false"}
      >
        <span className="auth-modal__social-mark" aria-hidden="true">
          <SocialProviderMark provider={provider} />
        </span>
        <span className="auth-modal__social-label">{social.compactLabel}</span>
        {socialLoadingProvider === provider ? (
          <span className="auth-modal__social-loading">{t("common.loading")}</span>
        ) : null}
      </Button>
    );
  });
  const hasEnabledSocialProviders =
    oauthWidgetConfig?.providers.some((provider) => provider.oauthEnabled) ?? true;

  const recoverPrimaryAction =
    recoverStep === 1
      ? {
          label: t("auth.passwordResetRequest"),
          onClick: handleRequestRecoveryCode,
        }
      : recoverStep === 2
      ? {
          label: t("auth.recoveryCodeVerify"),
          onClick: handleVerifyRecoveryCode,
        }
      : {
          label: t("auth.passwordResetConfirm"),
          onClick: handleSaveNewPassword,
        };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      maxWidth="sm"
      fullWidth
      className="ui-dialog ui-dialog--compact auth-modal"
    >
      <DialogContent className="auth-modal__content">
        <header className="auth-modal__header">
          <div className="auth-modal__topbar">
            <div className="auth-modal__topbar-side">
              {viewMode === "recover" ? (
                <IconButton
                  className="auth-modal__icon-btn"
                  onClick={openLogin}
                  aria-label={t("auth.backToLogin")}
                  size="small"
                >
                  <ArrowBackRoundedIcon fontSize="small" />
                </IconButton>
              ) : null}
            </div>
            <IconButton
              className="auth-modal__icon-btn"
              onClick={handleDialogClose}
              aria-label={t("common.close")}
              size="small"
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </div>
          <div className="auth-modal__title-wrap">
            <h2 className="auth-modal__title">
              {viewMode === "login" ? flowMeta.loginTitle : flowMeta.recoverTitle}
            </h2>
            {subtitleText ? <p className="auth-modal__subtitle">{subtitleText}</p> : null}
          </div>
        </header>

        {viewMode === "login" ? (
          <>
            <div className="auth-modal__alerts">
              {error ? <Alert severity="error">{error}</Alert> : null}
              {infoMessage ? <Alert severity="success">{infoMessage}</Alert> : null}
            </div>

            <div className="auth-modal__field-stack">
              <TextField
                className="auth-modal__email-field"
                label="Email"
                type="email"
                fullWidth
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              <TextField
                className="auth-modal__password-field"
                label={t("auth.passwordLabel")}
                type={showPassword ? "text" : "password"}
                fullWidth
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                InputProps={{
                  endAdornment: passwordVisibilityAdornment(
                    showPassword,
                    () => setShowPassword((prev) => !prev),
                    t("auth.passwordVisibilityToggle")
                  ),
                }}
              />
            </div>

            <Button
              className="auth-modal__submit"
              variant="contained"
              fullWidth
              onClick={handlePasswordLogin}
              disabled={submitLoading}
            >
              <ButtonPending loading={submitLoading} loadingLabel={t("connectivity.rechecking")}>
                {t("auth.passwordSubmit")}
              </ButtonPending>
            </Button>

            <button
              type="button"
              className="auth-modal__forgot-btn"
              onClick={openRecovery}
              disabled={submitLoading || Boolean(socialLoadingProvider)}
            >
              {t("auth.passwordResetShow")}
            </button>

            <div className="auth-modal__divider-row" aria-hidden="true">
              <Divider className="auth-modal__divider-line" />
              <Typography variant="caption" className="auth-modal__divider-text">
                {t("auth.socialDivider")}
              </Typography>
              <Divider className="auth-modal__divider-line" />
            </div>

            {socialButtons.length ? (
              <div className="auth-modal__social-grid">{socialButtons}</div>
            ) : null}

            {oauthWidgetConfigLoaded &&
            !hasEnabledSocialProviders ? (
              <Typography variant="caption" className="auth-modal__social-hint">
                {t("auth.socialProvidersNotConfigured")}
              </Typography>
            ) : null}
          </>
        ) : (
          <>
            <div className="auth-modal__recover-progress" role="status" aria-live="polite">
              <span className="auth-modal__recover-step">
                {t("auth.recoveryStepLabel", { step: recoverStep })}
              </span>
              <span className="auth-modal__recover-step-title">{recoverStage.title}</span>
            </div>

            <div className="auth-modal__alerts">
              {recoverError ? <Alert severity="error">{recoverError}</Alert> : null}
              {recoverMessage ? <Alert severity={recoverSeverity}>{recoverMessage}</Alert> : null}
              {recoverDebugCode ? (
                <Alert severity="info">{t("auth.passwordResetDebug", { token: recoverDebugCode })}</Alert>
              ) : null}
            </div>

            <div className="auth-modal__field-stack">
              <TextField
                className="auth-modal__email-field"
                label="Email"
                type="email"
                fullWidth
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              {recoverStep >= 2 ? (
                <TextField
                  label={t("auth.passwordResetTokenLabel")}
                  value={recoverCode}
                  onChange={(event) => setRecoverCode(parseRecoveryCode(event.target.value))}
                  fullWidth
                  autoComplete="one-time-code"
                />
              ) : null}

              {recoverStep === 3 ? (
                <div className="auth-modal__recovery-passwords">
                  <TextField
                    label={t("auth.passwordResetNewLabel")}
                    type={showNewPassword ? "text" : "password"}
                    fullWidth
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    InputProps={{
                      endAdornment: passwordVisibilityAdornment(
                        showNewPassword,
                        () => setShowNewPassword((prev) => !prev),
                        t("auth.newPasswordVisibilityToggle")
                      ),
                    }}
                  />

                  <TextField
                    label={t("auth.passwordResetConfirmLabel")}
                    type={showConfirmPassword ? "text" : "password"}
                    fullWidth
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    InputProps={{
                      endAdornment: passwordVisibilityAdornment(
                        showConfirmPassword,
                        () => setShowConfirmPassword((prev) => !prev),
                        t("auth.confirmPasswordVisibilityToggle")
                      ),
                    }}
                  />

                  <Typography variant="caption" className="auth-modal__password-hint">
                    {t("auth.passwordPolicyHint")}
                  </Typography>
                </div>
              ) : null}
            </div>

            <div className="auth-modal__recover-actions">
              <Button
                className="auth-modal__submit"
                variant="contained"
                fullWidth
                onClick={recoverPrimaryAction.onClick}
                disabled={recoverLoading}
              >
                <ButtonPending loading={recoverLoading} loadingLabel={t("connectivity.rechecking")}>
                  {recoverPrimaryAction.label}
                </ButtonPending>
              </Button>

              {recoverStep > 1 ? (
                <Button
                  className="auth-modal__link-btn"
                  variant="text"
                  onClick={handleRecoverStepBack}
                  disabled={recoverLoading}
                  startIcon={<ArrowBackRoundedIcon fontSize="small" />}
                >
                  {t("auth.recoveryBackStep")}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
