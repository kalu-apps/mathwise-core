import {
  Dialog,
  DialogContent,
  Button,
  TextField,
  Alert,
  Typography,
  IconButton,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import AlternateEmailRoundedIcon from "@mui/icons-material/AlternateEmailRounded";
import PasswordRoundedIcon from "@mui/icons-material/PasswordRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import { t } from "@/shared/i18n";
import { ButtonPending } from "@/shared/ui/loading";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import {
  confirmPasswordReset,
  recoverAccess,
  requestPasswordReset,
  resendVerification,
} from "@/features/auth/model/api";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  mode?: "login" | "recover";
  initialEmail?: string;
}

type AuthMethod = "magic" | "password";

const blurActiveElement = () => {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
};

export function AuthModal({
  open,
  onClose,
  mode = "login",
  initialEmail = "",
}: AuthModalProps) {
  const { requestLoginCode, confirmLoginCode, loginWithPassword } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const showAuthDebug = import.meta.env.DEV;

  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [email, setEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginCodeSent, setLoginCodeSent] = useState(false);
  const [loginCodeEmail, setLoginCodeEmail] = useState("");
  const [loginCodeDebug, setLoginCodeDebug] = useState<string | null>(null);
  const [loginCodeMessage, setLoginCodeMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverMessage, setRecoverMessage] = useState<string | null>(null);
  const [recoverSeverity, setRecoverSeverity] = useState<
    "success" | "info" | "warning" | "error"
  >("info");
  const [showRecover, setShowRecover] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetConfirmLoading, setResetConfirmLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPasswordValue, setShowResetPasswordValue] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetSeverity, setResetSeverity] = useState<
    "success" | "info" | "warning" | "error"
  >("info");
  const [resetDebugToken, setResetDebugToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitLoading(false);

    setAuthMethod("password");
    setEmail(initialEmail);
    setLoginCode("");
    setLoginCodeSent(false);
    setLoginCodeEmail("");
    setLoginCodeDebug(null);
    setLoginCodeMessage(null);
    setPassword("");
    setShowPassword(false);

    setRecoverMessage(null);
    setCanResend(false);
    setRecoverSeverity("info");
    setShowRecover(mode === "recover");
    if (mode === "recover" && !initialEmail.trim()) {
      setRecoverMessage(t("auth.recoverEnterEmail"));
    }

    setShowResetPassword(false);
    setResetLoading(false);
    setResetConfirmLoading(false);
    setResetToken("");
    setResetPassword("");
    setShowResetPasswordValue(false);
    setResetMessage(null);
    setResetSeverity("info");
    setResetDebugToken(null);
  }, [initialEmail, mode, open]);

  const normalizedEmail = email.trim().toLowerCase();
  const recoverHintLines = useMemo(
    () =>
      t("auth.recoverHint")
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean),
    []
  );

  const mobileIconActionSx = {
    width: 46,
    minWidth: 46,
    height: 46,
    padding: 1,
    borderRadius: 2.5,
  } as const;

  const handleDialogClose = useCallback(() => {
    blurActiveElement();
    onClose();
  }, [onClose]);

  const applyRecoverResult = useCallback(
    (
      recommendation: Awaited<ReturnType<typeof recoverAccess>>["recommendation"]
    ) => {
      if (recommendation === "complete_profile") {
        setRecoverSeverity("info");
        setRecoverMessage(t("auth.recoverNeedProfile"));
        setCanResend(false);
        return;
      }
      if (recommendation === "verify_email") {
        setRecoverSeverity("warning");
        setRecoverMessage(t("auth.recoverNeedVerification"));
        setCanResend(true);
        return;
      }
      if (recommendation === "no_access_records") {
        setRecoverSeverity("info");
        setRecoverMessage(t("auth.recoverNoRecords"));
        setCanResend(false);
        return;
      }
      if (recommendation === "restore_access") {
        setRecoverSeverity("info");
        setRecoverMessage(t("auth.recoverRestricted"));
        setCanResend(false);
        return;
      }
      setRecoverSeverity("success");
      setRecoverMessage(t("auth.recoverReady"));
      setCanResend(false);
    },
    []
  );

  const runRecoverCheck = useCallback(
    async (nextEmail: string) => {
      if (!nextEmail) {
        setRecoverSeverity("info");
        setRecoverMessage(t("auth.recoverEnterEmail"));
        setCanResend(false);
        return;
      }
      try {
        setRecoverLoading(true);
        const result = await recoverAccess(nextEmail);
        applyRecoverResult(result.recommendation);
      } catch (recoverError) {
        setRecoverSeverity("error");
        setRecoverMessage(
          recoverError instanceof Error ? recoverError.message : t("auth.loginFailed")
        );
        setCanResend(false);
      } finally {
        setRecoverLoading(false);
      }
    },
    [applyRecoverResult]
  );

  useEffect(() => {
    if (!open || mode !== "recover") return;
    void runRecoverCheck(normalizedEmail);
  }, [mode, normalizedEmail, open, runRecoverCheck]);

  useEffect(() => {
    if (authMethod !== "magic") return;
    if (!loginCodeSent) return;
    if (!loginCodeEmail) return;
    if (normalizedEmail === loginCodeEmail) return;
    setLoginCode("");
    setLoginCodeSent(false);
    setLoginCodeEmail("");
    setLoginCodeDebug(null);
    setLoginCodeMessage(null);
  }, [normalizedEmail, authMethod, loginCodeSent, loginCodeEmail]);

  useEffect(() => {
    if (authMethod !== "magic") return;
    setError(null);
  }, [authMethod]);

  useEffect(() => {
    if (authMethod === "magic") return;
    setShowRecover(false);
    setRecoverMessage(null);
    setCanResend(false);
  }, [authMethod]);

  useEffect(() => {
    if (authMethod === "password") return;
    setShowResetPassword(false);
    setResetMessage(null);
    setResetDebugToken(null);
  }, [authMethod]);

  const collapseRecoverPanels = useCallback(() => {
    if (!showRecover) return;
    setShowRecover(false);
    setRecoverMessage(null);
    setCanResend(false);
  }, [showRecover]);

  const maybeCollapseRecoverPanels = useCallback(
    (target: EventTarget | null) => {
      if (!showRecover) return;
      if (!(target instanceof HTMLElement)) {
        collapseRecoverPanels();
        return;
      }
      if (target.closest(".auth-modal__recover")) return;
      collapseRecoverPanels();
    },
    [collapseRecoverPanels, showRecover]
  );

  const maybeCollapseResetPanel = useCallback(
    (target: EventTarget | null) => {
      if (!showResetPassword) return;
      if (!(target instanceof HTMLElement)) {
        setShowResetPassword(false);
        return;
      }
      if (target.closest(".auth-modal__email-field")) return;
      if (target.closest(".auth-modal__reset-panel")) return;
      setShowResetPassword(false);
    },
    [showResetPassword]
  );

  const handleSubmit = async () => {
    setError(null);

    if (!normalizedEmail) {
      setError(t("auth.emailRequired"));
      return;
    }

    setSubmitLoading(true);
    try {
      if (authMethod === "password") {
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
      } else if (loginCodeSent) {
        const result = await confirmLoginCode(normalizedEmail, loginCode);
        if (!result.ok) {
          setError(result.error ?? t("auth.sendLinkFailed"));
          return;
        }
      } else {
        const result = await requestLoginCode(normalizedEmail);
        if (!result.ok) {
          setError(result.error ?? t("auth.sendLinkFailed"));
          return;
        }
        setLoginCodeSent(true);
        setLoginCodeEmail(normalizedEmail);
        setLoginCodeMessage(result.message ?? t("auth.magicCodeSent"));
        setLoginCodeDebug(showAuthDebug ? (result.debugCode ?? null) : null);
        return;
      }
      handleDialogClose();
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleRecover = async () => {
    if (showRecover) {
      setShowRecover(false);
      setRecoverMessage(null);
      setCanResend(false);
      return;
    }

    setError(null);
    setRecoverMessage(null);
    setCanResend(false);
    setShowRecover(true);
    if (!normalizedEmail) {
      setRecoverSeverity("info");
      setRecoverMessage(t("auth.recoverEnterEmail"));
      return;
    }
    await runRecoverCheck(normalizedEmail);
  };

  const handleResendVerification = async () => {
    if (!normalizedEmail) {
      setError(t("auth.emailRequired"));
      return;
    }
    try {
      setResendLoading(true);
      const result = await resendVerification(normalizedEmail);
      setRecoverSeverity("success");
      setRecoverMessage(result.message);
      setShowRecover(true);
    } catch (recoverError) {
      setRecoverSeverity("error");
      setRecoverMessage(
        recoverError instanceof Error ? recoverError.message : t("auth.sendLinkFailed")
      );
      setShowRecover(true);
    } finally {
      setResendLoading(false);
    }
  };

  const handleRequestReset = async () => {
    setError(null);
    if (!normalizedEmail) {
      setError(t("auth.emailRequired"));
      return;
    }
    try {
      setResetLoading(true);
      const result = await requestPasswordReset(normalizedEmail);
      setResetSeverity("success");
      setResetMessage(result.message);
      setResetDebugToken(showAuthDebug ? (result.debugToken ?? null) : null);
    } catch (resetError) {
      setResetSeverity("error");
      setResetMessage(
        resetError instanceof Error ? resetError.message : t("auth.loginFailed")
      );
      setResetDebugToken(null);
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    setError(null);
    if (!normalizedEmail || !resetToken.trim() || !resetPassword.trim()) {
      setError(t("auth.passwordResetFieldsRequired"));
      return;
    }
    try {
      setResetConfirmLoading(true);
      const result = await confirmPasswordReset({
        email: normalizedEmail,
        token: resetToken.trim(),
        newPassword: resetPassword,
      });
      setResetSeverity("success");
      setResetMessage(result.message);
      setResetDebugToken(null);
      setAuthMethod("password");
      setPassword("");
      setResetToken("");
      setResetPassword("");
    } catch (confirmError) {
      setResetSeverity("error");
      setResetMessage(
        confirmError instanceof Error ? confirmError.message : t("auth.loginFailed")
      );
      setResetDebugToken(null);
    } finally {
      setResetConfirmLoading(false);
    }
  };

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

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      maxWidth="sm"
      fullWidth
      className="ui-dialog ui-dialog--compact auth-modal"
    >
      <DialogTitleWithClose
        title={t("auth.modalTitle")}
        className="auth-modal__title"
        onClose={handleDialogClose}
        closeAriaLabel={t("common.close")}
      />

      <DialogContent
        className="auth-modal__content"
        onFocusCapture={(event) => {
          maybeCollapseRecoverPanels(event.target);
          maybeCollapseResetPanel(event.target);
        }}
        onMouseDownCapture={(event) => {
          maybeCollapseRecoverPanels(event.target);
          maybeCollapseResetPanel(event.target);
        }}
      >
        {error && <Alert severity="error">{error}</Alert>}

        <Typography
          variant="body2"
          color="text.secondary"
          className="auth-modal__description"
        >
          {t("auth.modalDescription")}
        </Typography>

        <div className="auth-modal__mode-switch" role="tablist" aria-label="Режим входа">
          <Button
            type="button"
            variant={authMethod === "magic" ? "contained" : "outlined"}
            onClick={() => setAuthMethod("magic")}
            startIcon={<AlternateEmailRoundedIcon fontSize="small" />}
            className="auth-modal__mode-btn"
          >
            {t("auth.methodMagic")}
          </Button>
          <Button
            type="button"
            variant={authMethod === "password" ? "contained" : "outlined"}
            onClick={() => setAuthMethod("password")}
            startIcon={<PasswordRoundedIcon fontSize="small" />}
            className="auth-modal__mode-btn"
          >
            {t("auth.methodPassword")}
          </Button>
        </div>

        <TextField
          className="auth-modal__email-field"
          label="Email"
          type="email"
          fullWidth
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />

        {authMethod === "password" && (
          <TextField
            label={t("auth.passwordLabel")}
            type={showPassword ? "text" : "password"}
            fullWidth
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputLabelProps={{ shrink: true }}
            InputProps={{
              endAdornment: passwordVisibilityAdornment(
                showPassword,
                () => setShowPassword((prev) => !prev),
                "Показать или скрыть пароль"
              ),
            }}
          />
        )}

        {authMethod === "magic" && loginCodeSent && (
          <>
            {loginCodeMessage && (
              <Alert severity="success" className="auth-modal__recover-state">
                {loginCodeMessage}
              </Alert>
            )}

            {loginCodeDebug && (
              <Alert severity="info" className="auth-modal__recover-state">
                {t("auth.magicCodeDebug", { code: loginCodeDebug })}
              </Alert>
            )}

            <TextField
              label={t("auth.magicCodeLabel")}
              value={loginCode}
              onChange={(e) =>
                setLoginCode(e.target.value.replace(/\s+/g, "").slice(0, 12))
              }
              fullWidth
              autoComplete="one-time-code"
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}

        <div className="auth-modal__actions">
          {isMobile ? (
            <div className="auth-modal__primary">
              <Button
                className="auth-modal__submit"
                variant="contained"
                onClick={handleSubmit}
                disabled={submitLoading}
                aria-label={
                  authMethod === "password"
                    ? t("auth.passwordSubmit")
                    : loginCodeSent
                    ? t("auth.magicCodeConfirm")
                    : t("auth.modalSubmit")
                }
                sx={mobileIconActionSx}
              >
                {authMethod === "password" ? (
                  <LockOpenRoundedIcon fontSize="small" />
                ) : loginCodeSent ? (
                  <MarkEmailReadRoundedIcon fontSize="small" />
                ) : (
                  <LoginRoundedIcon fontSize="small" />
                )}
              </Button>

              {authMethod === "magic" && (
                <Button
                  className="auth-modal__recover"
                  variant="outlined"
                  onClick={handleRecover}
                  disabled={recoverLoading}
                  aria-label={t("auth.recoverAction")}
                  sx={mobileIconActionSx}
                >
                  <HelpOutlineRoundedIcon fontSize="small" />
                </Button>
              )}

              {authMethod === "password" && (
                <Button
                  className="auth-modal__recover"
                  variant="outlined"
                  onClick={() => setShowResetPassword((prev) => !prev)}
                  disabled={resetLoading || resetConfirmLoading}
                  aria-label={
                    showResetPassword
                      ? t("auth.passwordResetHide")
                      : t("auth.passwordResetShow")
                  }
                  sx={mobileIconActionSx}
                >
                  <MarkEmailReadRoundedIcon fontSize="small" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <Button
                className="auth-modal__submit"
                variant="contained"
                fullWidth
                onClick={handleSubmit}
                disabled={submitLoading}
              >
                <ButtonPending
                  loading={submitLoading}
                  loadingLabel={t("connectivity.rechecking")}
                >
                  {authMethod === "password"
                    ? t("auth.passwordSubmit")
                    : loginCodeSent
                    ? t("auth.magicCodeConfirm")
                    : t("auth.modalSubmit")}
                </ButtonPending>
              </Button>

              {authMethod === "magic" && (
                <Button
                  className="auth-modal__recover"
                  variant="text"
                  fullWidth
                  onClick={handleRecover}
                  disabled={recoverLoading}
                >
                  <ButtonPending
                    loading={recoverLoading}
                    loadingLabel={t("connectivity.rechecking")}
                  >
                    {t("auth.recoverAction")}
                  </ButtonPending>
                </Button>
              )}
            </>
          )}

          {authMethod === "password" && !isMobile && (
            <div className="auth-modal__secondary-actions">
              <Button
                className="auth-modal__reset-toggle"
                variant="text"
                onClick={() => setShowResetPassword((prev) => !prev)}
                disabled={resetLoading || resetConfirmLoading}
                startIcon={<MarkEmailReadRoundedIcon fontSize="small" />}
              >
                {showResetPassword
                  ? t("auth.passwordResetHide")
                  : t("auth.passwordResetShow")}
              </Button>
            </div>
          )}

          {authMethod === "password" && showResetPassword && (
            <div className="auth-modal__reset-panel">
              {resetMessage && (
                <Alert severity={resetSeverity} className="auth-modal__recover-state">
                  {resetMessage}
                </Alert>
              )}

              {resetDebugToken && (
                <Alert severity="info" className="auth-modal__recover-state">
                  {t("auth.passwordResetDebug", { token: resetDebugToken })}
                </Alert>
              )}

              <Button
                className="auth-modal__resend"
                variant="outlined"
                fullWidth
                onClick={handleRequestReset}
                disabled={resetLoading}
              >
                <ButtonPending
                  loading={resetLoading}
                  loadingLabel={t("connectivity.rechecking")}
                >
                  {t("auth.passwordResetRequest")}
                </ButtonPending>
              </Button>

              <TextField
                label={t("auth.passwordResetTokenLabel")}
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                fullWidth
                autoComplete="one-time-code"
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                label={t("auth.passwordResetNewLabel")}
                type={showResetPasswordValue ? "text" : "password"}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                fullWidth
                autoComplete="new-password"
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  endAdornment: passwordVisibilityAdornment(
                    showResetPasswordValue,
                    () => setShowResetPasswordValue((prev) => !prev),
                    "Показать или скрыть новый пароль"
                  ),
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {t("auth.passwordPolicyHint")}
              </Typography>

              <Button
                className="auth-modal__reset-submit"
                variant="contained"
                fullWidth
                onClick={handleConfirmReset}
                disabled={resetConfirmLoading}
              >
                <ButtonPending
                  loading={resetConfirmLoading}
                  loadingLabel={t("connectivity.rechecking")}
                >
                  {t("auth.passwordResetConfirm")}
                </ButtonPending>
              </Button>
            </div>
          )}

          {authMethod === "magic" && showRecover && (
            <Alert severity="warning" className="auth-modal__recover-hint">
              <div className="auth-modal__warning-lines">
                {recoverHintLines.map((line, index) => (
                  <Typography key={index} variant="body2" component="p">
                    {line}
                  </Typography>
                ))}
              </div>
            </Alert>
          )}

          {authMethod === "magic" && showRecover && recoverMessage && (
            <Alert severity={recoverSeverity} className="auth-modal__recover-state">
              {recoverMessage}
            </Alert>
          )}

          {authMethod === "magic" && showRecover && (
            <Typography
              variant="caption"
              color="text.secondary"
              className="auth-modal__recover-description"
            >
              {t("auth.recoverDescription")}
            </Typography>
          )}

          {authMethod === "magic" && showRecover && canResend && (
            <Button
              className="auth-modal__resend"
              variant="outlined"
              fullWidth={!isMobile}
              onClick={handleResendVerification}
              disabled={resendLoading}
            >
              <ButtonPending
                loading={resendLoading}
                loadingLabel={t("connectivity.rechecking")}
              >
                {t("auth.recoverResend")}
              </ButtonPending>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
