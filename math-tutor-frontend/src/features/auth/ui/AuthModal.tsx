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
import GoogleIcon from "@mui/icons-material/Google";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import { t } from "@/shared/i18n";
import { ButtonPending } from "@/shared/ui/loading";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
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
  mode?: "login" | "recover";
  initialEmail?: string;
  initialError?: string | null;
}

type ViewMode = "login" | "recover";
type RecoveryStep = 1 | 2 | 3;

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
      badge: "VK",
      className: "auth-modal__social-btn--vk",
    };
  }
  if (provider === "yandex") {
    return {
      label: t("auth.socialYandex"),
      badge: "Я",
      className: "auth-modal__social-btn--yandex",
    };
  }
  return {
    label: t("auth.socialGoogle"),
    badge: "G",
    className: "auth-modal__social-btn--google",
  };
};

const parseRecoveryCode = (value: string) => value.replace(/\D+/g, "").slice(0, 6);

export function AuthModal({
  open,
  onClose,
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
      <IconButton onClick={onToggle} edge="end" size="small" aria-label={ariaLabel}>
        {visible ? (
          <VisibilityOffRoundedIcon fontSize="small" />
        ) : (
          <VisibilityRoundedIcon fontSize="small" />
        )}
      </IconButton>
    </InputAdornment>
  );

  const renderError = () => {
    if (!error) return null;
    return <Alert severity="error">{error}</Alert>;
  };

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
    setError(null);
    setInfoMessage(null);
  };

  const openLogin = () => {
    setViewMode("login");
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
        fullWidth
        className={`auth-modal__social-btn ${social.className}`}
        onClick={() => handleSocialLogin(provider)}
        disabled={Boolean(socialLoadingProvider)}
      >
        <span className="auth-modal__social-badge" aria-hidden="true">
          {provider === "google" ? <GoogleIcon fontSize="small" /> : social.badge}
        </span>
        <span>{social.label}</span>
        {socialLoadingProvider === provider ? (
          <span className="auth-modal__social-loading">{t("common.loading")}</span>
        ) : null}
      </Button>
    );
  });

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      maxWidth="sm"
      fullWidth
      className="ui-dialog ui-dialog--compact auth-modal"
    >
      <DialogTitleWithClose
        title={viewMode === "login" ? t("auth.modalTitle") : t("auth.recoverTitle")}
        className="auth-modal__title"
        onClose={handleDialogClose}
        closeAriaLabel={t("common.close")}
      />

      <DialogContent className="auth-modal__content">
        {renderError()}
        {infoMessage && <Alert severity="success">{infoMessage}</Alert>}

        {viewMode === "login" ? (
          <>
            <Typography variant="body2" color="text.secondary" className="auth-modal__description">
              {t("auth.modalDescription")}
            </Typography>

            <TextField
              className="auth-modal__email-field"
              label="Email"
              type="email"
              fullWidth
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label={t("auth.passwordLabel")}
              type={showPassword ? "text" : "password"}
              fullWidth
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: passwordVisibilityAdornment(
                  showPassword,
                  () => setShowPassword((prev) => !prev),
                  t("auth.passwordVisibilityToggle")
                ),
              }}
            />

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
              className="auth-modal__link-btn"
              variant="text"
              onClick={openRecovery}
              disabled={submitLoading || Boolean(socialLoadingProvider)}
            >
              {t("auth.passwordResetShow")}
            </Button>

            <Divider className="auth-modal__divider" />

            <Typography
              variant="caption"
              color="text.secondary"
              className="auth-modal__social-caption"
            >
              {t("auth.socialDivider")}
            </Typography>

            <div className="auth-modal__social-grid">{socialButtons}</div>
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" className="auth-modal__description">
              {t("auth.recoverFlowDescription")}
            </Typography>

            <TextField
              className="auth-modal__email-field"
              label="Email"
              type="email"
              fullWidth
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />

            <Typography variant="caption" color="text.secondary" className="auth-modal__step-note">
              {t("auth.recoveryStepLabel", { step: recoverStep })}
            </Typography>

            {recoverStep >= 2 && (
              <TextField
                label={t("auth.passwordResetTokenLabel")}
                value={recoverCode}
                onChange={(event) => setRecoverCode(parseRecoveryCode(event.target.value))}
                fullWidth
                autoComplete="one-time-code"
                InputLabelProps={{ shrink: true }}
              />
            )}

            {recoverStep === 3 && (
              <div className="auth-modal__recovery-passwords">
                <TextField
                  label={t("auth.passwordResetNewLabel")}
                  type={showNewPassword ? "text" : "password"}
                  fullWidth
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  InputLabelProps={{ shrink: true }}
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
                  InputLabelProps={{ shrink: true }}
                  InputProps={{
                    endAdornment: passwordVisibilityAdornment(
                      showConfirmPassword,
                      () => setShowConfirmPassword((prev) => !prev),
                      t("auth.confirmPasswordVisibilityToggle")
                    ),
                  }}
                />

                <Typography variant="caption" color="text.secondary">
                  {t("auth.passwordPolicyHint")}
                </Typography>
              </div>
            )}

            {recoverError && <Alert severity="error">{recoverError}</Alert>}
            {recoverMessage && <Alert severity={recoverSeverity}>{recoverMessage}</Alert>}
            {recoverDebugCode && (
              <Alert severity="info">
                {t("auth.passwordResetDebug", { token: recoverDebugCode })}
              </Alert>
            )}

            <div className="auth-modal__recover-actions">
              {recoverStep === 1 && (
                <Button
                  className="auth-modal__submit"
                  variant="contained"
                  fullWidth
                  onClick={handleRequestRecoveryCode}
                  disabled={recoverLoading}
                >
                  <ButtonPending
                    loading={recoverLoading}
                    loadingLabel={t("connectivity.rechecking")}
                  >
                    {t("auth.passwordResetRequest")}
                  </ButtonPending>
                </Button>
              )}

              {recoverStep === 2 && (
                <Button
                  className="auth-modal__submit"
                  variant="contained"
                  fullWidth
                  onClick={handleVerifyRecoveryCode}
                  disabled={recoverLoading}
                >
                  <ButtonPending
                    loading={recoverLoading}
                    loadingLabel={t("connectivity.rechecking")}
                  >
                    {t("auth.recoveryCodeVerify")}
                  </ButtonPending>
                </Button>
              )}

              {recoverStep === 3 && (
                <Button
                  className="auth-modal__submit"
                  variant="contained"
                  fullWidth
                  onClick={handleSaveNewPassword}
                  disabled={recoverLoading}
                >
                  <ButtonPending
                    loading={recoverLoading}
                    loadingLabel={t("connectivity.rechecking")}
                  >
                    {t("auth.passwordResetConfirm")}
                  </ButtonPending>
                </Button>
              )}

              {recoverStep > 1 && (
                <Button
                  className="auth-modal__link-btn"
                  variant="text"
                  onClick={() => {
                    setRecoverStep((prev) => (prev > 1 ? ((prev - 1) as RecoveryStep) : prev));
                    setRecoverError(null);
                    setRecoverMessage(null);
                  }}
                  disabled={recoverLoading}
                >
                  {t("auth.recoveryBackStep")}
                </Button>
              )}
            </div>

            <Button className="auth-modal__link-btn" variant="text" onClick={openLogin}>
              {t("auth.backToLogin")}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
