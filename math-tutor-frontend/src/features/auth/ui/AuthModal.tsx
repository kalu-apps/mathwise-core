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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { faVk, faYandex } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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

type GoogleIdentitySdk = {
  initialize: (options: {
    client_id: string;
    callback: (response: unknown) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: string;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      shape?: "rectangular" | "pill" | "circle" | "square";
      size?: "large" | "medium" | "small";
      text?: string;
      logo_alignment?: "left" | "center";
      locale?: string;
      width?: number;
    }
  ) => void;
};

type YandexAuthSuggestSdk = {
  init: (
    authOptions: {
      client_id: string;
      response_type: string;
      redirect_uri: string;
    },
    baseOrigin: string,
    viewOptions: {
      view: "button";
      parentId: string;
      buttonView: "main";
      buttonTheme: "light" | "dark";
      buttonSize: "m" | "l";
      buttonBorderRadius: number;
      buttonIcon: "ya";
    }
  ) => Promise<{ handler?: () => Promise<unknown> | unknown }>;
};

type VkIdOneTapSdk = {
  render: (options: {
    container: HTMLElement;
    showAlternativeLogin: boolean;
    oauthList: string[];
  }) => void;
};

type VkIdSdk = {
  Config: {
    init: (options: {
      app: number;
      redirectUrl: string;
      responseMode?: string;
      source?: string;
      scope?: string;
      state?: string;
    }) => void;
  };
  ConfigResponseMode?: { Redirect?: string };
  ConfigSource?: { LOWCODE?: string };
  OneTap: new () => VkIdOneTapSdk;
};

type OAuthWidgetWindow = Window & {
  google?: { accounts?: { id?: GoogleIdentitySdk } };
  YaAuthSuggest?: YandexAuthSuggestSdk;
  VKID?: VkIdSdk;
};

const externalScriptCache = new Map<string, Promise<void>>();
const ensureExternalScript = (src: string) => {
  const normalized = src.trim();
  if (!normalized) {
    return Promise.reject(new Error("Empty external script url"));
  }
  const cached = externalScriptCache.get(normalized);
  if (cached) return cached;
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-auth-oauth-sdk="${CSS.escape(normalized)}"]`
  );
  if (existing?.dataset.loaded === "true") {
    const done = Promise.resolve();
    externalScriptCache.set(normalized, done);
    return done;
  }
  const promise = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = normalized;
    script.dataset.authOauthSdk = normalized;
    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => {
      script.dataset.loaded = "true";
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      externalScriptCache.delete(normalized);
      reject(new Error(`Failed to load external script: ${normalized}`));
    };
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      document.head.appendChild(script);
    }
  });
  externalScriptCache.set(normalized, promise);
  return promise;
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
      <FontAwesomeIcon
        icon={faVk}
        className="auth-modal__social-brand auth-modal__social-brand--vk"
        aria-hidden="true"
      />
    );
  }
  return (
    <FontAwesomeIcon
      icon={faYandex}
      className="auth-modal__social-brand auth-modal__social-brand--yandex"
      aria-hidden="true"
    />
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
  const [oauthWidgetConfig, setOauthWidgetConfig] = useState<OauthWidgetConfigResponse | null>(
    null
  );
  const [oauthWidgetConfigLoaded, setOauthWidgetConfigLoaded] = useState(false);
  const [officialWidgetRender, setOfficialWidgetRender] = useState<
    Record<SocialProvider, "idle" | "rendered" | "failed">
  >({
    vk: "idle",
    yandex: "idle",
    google: "idle",
  });
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const officialWidgetMounts = useRef<Record<SocialProvider, HTMLDivElement | null>>({
    vk: null,
    yandex: null,
    google: null,
  });

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
  const officialConfiguredProviders = useMemo(
    () =>
      socialProviders.filter((provider) => {
        const config = providerConfigByKey[provider];
        return Boolean(config?.ready && config.clientId && config.scriptUrl);
      }),
    [providerConfigByKey, socialProviders]
  );
  const officialRenderableProviders = useMemo(
    () =>
      officialConfiguredProviders.filter(
        (provider) => officialWidgetRender[provider] !== "failed"
      ),
    [officialConfiguredProviders, officialWidgetRender]
  );

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
    setOfficialWidgetRender({
      vk: "idle",
      yandex: "idle",
      google: "idle",
    });
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

  useEffect(() => {
    if (!open || viewMode !== "login" || !oauthWidgetConfigLoaded) return;
    let cancelled = false;

    const renderProviderWidget = async (provider: SocialProvider) => {
      const config = providerConfigByKey[provider];
      const mount = officialWidgetMounts.current[provider];
      if (!config?.ready || !config.clientId || !config.scriptUrl || !mount) {
        return;
      }

      try {
        await ensureExternalScript(config.scriptUrl);
        if (cancelled) return;
        mount.innerHTML = "";

        if (provider === "google") {
          const sdkWindow = window as OAuthWidgetWindow;
          const googleId = sdkWindow.google?.accounts?.id;
          if (!googleId?.initialize || !googleId?.renderButton) {
            throw new Error("Google GIS SDK is unavailable");
          }
          googleId.initialize({
            client_id: config.clientId,
            callback: () => undefined,
            auto_select: false,
            cancel_on_tap_outside: true,
            context: "signin",
          });
          googleId.renderButton(mount, {
            type: "standard",
            theme: "outline",
            shape: "rectangular",
            size: "large",
            text: "signin_with",
            logo_alignment: "left",
            locale: "ru",
            width: Math.max(220, Math.floor(mount.clientWidth || 280)),
          });
        } else if (provider === "yandex") {
          const sdkWindow = window as OAuthWidgetWindow;
          const yaSuggest = sdkWindow.YaAuthSuggest;
          if (!yaSuggest?.init) {
            throw new Error("Yandex ID SDK is unavailable");
          }
          const parentId = mount.id || `auth-modal-yandex-widget`;
          mount.id = parentId;
          const suggestResult = await yaSuggest.init(
            {
              client_id: config.clientId,
              response_type: "token",
              redirect_uri: `${window.location.origin}/oauth/yandex/widget-preview`,
            },
            window.location.origin,
            {
              view: "button",
              parentId,
              buttonView: "main",
              buttonTheme: "light",
              buttonSize: "m",
              buttonBorderRadius: 12,
              buttonIcon: "ya",
            }
          );
          if (typeof suggestResult?.handler === "function") {
            await Promise.resolve(suggestResult.handler());
          }
        } else if (provider === "vk") {
          const sdkWindow = window as OAuthWidgetWindow;
          const VKID = sdkWindow.VKID;
          if (!VKID?.Config?.init || !VKID?.OneTap) {
            throw new Error("VK ID SDK is unavailable");
          }
          const appId = Number(config.clientId);
          if (!Number.isFinite(appId) || appId <= 0) {
            throw new Error("VK ID app id must be a positive number");
          }
          VKID.Config.init({
            app: appId,
            redirectUrl: `${window.location.origin}/oauth/vk/widget-preview`,
            responseMode: VKID.ConfigResponseMode?.Redirect,
            source: VKID.ConfigSource?.LOWCODE,
            scope: "email",
            state: "preview-widget",
          });
          const oneTap = new VKID.OneTap();
          oneTap.render({
            container: mount,
            showAlternativeLogin: false,
            oauthList: ["vk"],
          });
        }

        if (!cancelled) {
          setOfficialWidgetRender((prev) => ({ ...prev, [provider]: "rendered" }));
        }
      } catch {
        if (!cancelled) {
          setOfficialWidgetRender((prev) => ({ ...prev, [provider]: "failed" }));
        }
      }
    };

    officialConfiguredProviders.forEach((provider) => {
      void renderProviderWidget(provider);
    });

    return () => {
      cancelled = true;
    };
  }, [
    officialConfiguredProviders,
    open,
    oauthWidgetConfigLoaded,
    providerConfigByKey,
    viewMode,
  ]);

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

  const handleOfficialWidgetStub = (provider: SocialProvider) => {
    const social = mapSocialButton(provider);
    setError(null);
    setInfoMessage(
      t("auth.socialWidgetPreviewStub", {
        provider: social.compactLabel,
      })
    );
  };

  const socialButtons = socialProviders
    .filter((provider) => !officialRenderableProviders.includes(provider))
    .map((provider) => {
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
  const hasEnabledSocialProviders =
    oauthWidgetConfig?.providers.some((provider) => provider.oauthEnabled) ?? true;
  const hasInteractiveOfficialProviders =
    oauthWidgetConfig?.providers.some(
      (provider) => provider.ready && provider.interactive
    ) ?? false;

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

            {officialRenderableProviders.length ? (
              <div className="auth-modal__official-grid">
                {officialRenderableProviders.map((provider) => {
                  const config = providerConfigByKey[provider];
                  const interactive = config?.interactive ?? false;
                  return (
                    <div key={`official-${provider}`} className="auth-modal__official-item">
                      <div className="auth-modal__official-shell">
                        <div
                          className="auth-modal__official-mount"
                          data-provider={provider}
                          ref={(node) => {
                            officialWidgetMounts.current[provider] = node;
                          }}
                        />
                        {!interactive ? (
                          <button
                            type="button"
                            className="auth-modal__official-overlay"
                            aria-label={mapSocialButton(provider).label}
                            onClick={() => handleOfficialWidgetStub(provider)}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {socialButtons.length ? (
              <div className="auth-modal__social-grid">{socialButtons}</div>
            ) : null}

            {oauthWidgetConfigLoaded &&
            officialRenderableProviders.length > 0 &&
            !hasInteractiveOfficialProviders ? (
              <Typography variant="caption" className="auth-modal__social-hint">
                {t("auth.socialWidgetPreviewOnly")}
              </Typography>
            ) : null}

            {oauthWidgetConfigLoaded &&
            officialRenderableProviders.length === 0 &&
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
