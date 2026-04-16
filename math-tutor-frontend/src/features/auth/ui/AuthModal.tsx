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
import { useCallback, useEffect, useState } from "react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import GoogleIcon from "@mui/icons-material/Google";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import { t } from "@/shared/i18n";
import { ButtonPending } from "@/shared/ui/loading";
import type { AuthModalContext } from "@/features/auth/model/authUiStore";
import {
  buildSocialLoginStartUrl,
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
    return <GoogleIcon fontSize="small" />;
  }
  if (provider === "vk") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#2787F5" />
        <path
          d="M7.2 7.4h2.3c.2 0 .4.1.5.2l2.1 3c.2.2.4.2.5 0l2.1-3c.1-.1.3-.2.5-.2h2.2l-3.3 4.6 3.5 4.8h-2.3c-.2 0-.3-.1-.5-.2l-2.3-3.2c-.1-.2-.4-.2-.5 0l-2.4 3.2c-.1.1-.2.2-.4.2H6.8l3.5-4.8-3.1-4.6z"
          fill="#fff"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#FC3F1D" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fontFamily="Arial, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        fill="#fff"
      >
        Я
      </text>
    </svg>
  );
};

const parseRecoveryCode = (value: string) => value.replace(/\D+/g, "").slice(0, 6);

const flowMetaByContext: Record<AuthModalContext, FlowMeta> = {
  general: {
    loginTitle: "Вход в аккаунт",
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
  const socialProviders: SocialProvider[] = ["vk", "yandex", "google"];
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
    return (
      <Button
        key={provider}
        type="button"
        variant="outlined"
        className={`auth-modal__social-btn ${social.className}`}
        onClick={() => handleSocialLogin(provider)}
        disabled={Boolean(socialLoadingProvider)}
        aria-label={social.label}
      >
        <span className="auth-modal__social-badge" aria-hidden="true">
          <SocialProviderMark provider={provider} />
        </span>
        <span className="auth-modal__social-label">{social.compactLabel}</span>
        {socialLoadingProvider === provider ? (
          <span className="auth-modal__social-loading">{t("common.loading")}</span>
        ) : null}
      </Button>
    );
  });

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

            <Button
              className="auth-modal__link-btn auth-modal__forgot-btn"
              variant="text"
              onClick={openRecovery}
              disabled={submitLoading || Boolean(socialLoadingProvider)}
            >
              {t("auth.passwordResetShow")}
            </Button>

            <div className="auth-modal__divider-row" aria-hidden="true">
              <Divider className="auth-modal__divider-line" />
              <Typography variant="caption" className="auth-modal__divider-text">
                {t("auth.socialDivider")}
              </Typography>
              <Divider className="auth-modal__divider-line" />
            </div>

            <div className="auth-modal__social-grid">{socialButtons}</div>
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
