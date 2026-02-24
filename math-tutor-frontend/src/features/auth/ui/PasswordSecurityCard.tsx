import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
} from "@mui/material";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import SyncLockRoundedIcon from "@mui/icons-material/SyncLockRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { cn } from "@/shared/lib/cn";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  changePassword,
  getPasswordStatus,
  setPassword,
} from "@/features/auth/model/api";

type PasswordSecurityCardProps = {
  className?: string;
};

type PanelMode = "closed" | "create" | "change";

const validateStrongPassword = (password: string): string | null => {
  const value = password.normalize("NFKC");
  if (value.length < 10) {
    return "Минимальная длина пароля — 10 символов.";
  }
  if (value.length > 64) {
    return "Максимальная длина пароля — 64 символа.";
  }
  if (/\s/.test(value)) {
    return "Пароль не должен содержать пробелы.";
  }
  if (!/^[\x21-\x7E]+$/.test(value)) {
    return "Используйте только латиницу, цифры и специальные символы.";
  }
  if (!/[a-z]/.test(value)) {
    return "Добавьте хотя бы одну строчную букву.";
  }
  if (!/[A-Z]/.test(value)) {
    return "Добавьте хотя бы одну заглавную букву.";
  }
  if (!/\d/.test(value)) {
    return "Добавьте хотя бы одну цифру.";
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(value)) {
    return "Добавьте хотя бы один специальный символ.";
  }
  return null;
};

export function PasswordSecurityCard({ className }: PasswordSecurityCardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<PanelMode>("closed");
  const [status, setStatus] = useState<{
    hasPassword: boolean;
    state: "none" | "active" | "reset_pending" | "locked_temp";
    lockedUntil: string | null;
    lastPasswordChangeAt: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const payload = await getPasswordStatus();
      setStatus({
        hasPassword: payload.hasPassword,
        state: payload.state,
        lockedUntil: payload.lockedUntil,
        lastPasswordChangeAt: payload.lastPasswordChangeAt,
      });
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось загрузить состояние пароля."
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const statusText = useMemo(() => {
    if (!status) return "Проверка статуса";
    if (status.state === "locked_temp" && status.lockedUntil) {
      return `Вход по паролю временно заблокирован до ${new Date(
        status.lockedUntil
      ).toLocaleString("ru-RU")}`;
    }
    if (status.hasPassword) {
      return "Пароль установлен";
    }
    return "Пароль пока не задан";
  }, [status]);

  const resetFormState = () => {
    setCurrentPassword("");
    setNextPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNextPassword(false);
    setShowConfirmPassword(false);
  };

  const openCreatePanel = () => {
    setMode("create");
    setError(null);
    setSuccess(null);
    resetFormState();
  };

  const openChangePanel = () => {
    setMode("change");
    setError(null);
    setSuccess(null);
    resetFormState();
  };

  const closePanel = () => {
    setMode("closed");
    setError(null);
    resetFormState();
  };

  const passwordInputType = (visible: boolean) => (visible ? "text" : "password");

  const getPasswordAdornment = (
    visible: boolean,
    onToggle: () => void,
    ariaLabel: string
  ) => (
    <InputAdornment position="end">
      <IconButton
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

  const handleSavePassword = async () => {
    setError(null);
    setSuccess(null);

    if (!nextPassword.trim() || !confirmPassword.trim()) {
      setError("Заполните новый пароль и подтверждение.");
      return;
    }

    if (nextPassword !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    const passwordValidationError = validateStrongPassword(nextPassword);
    if (passwordValidationError) {
      setError(passwordValidationError);
      return;
    }

    if (mode === "change" && !currentPassword.trim()) {
      setError("Введите текущий пароль.");
      return;
    }

    try {
      setSaving(true);
      const response =
        mode === "change"
          ? await changePassword({
              currentPassword,
              newPassword: nextPassword,
            })
          : await setPassword({
              newPassword: nextPassword,
            });

      setSuccess(response.message);
      closePanel();
      await loadStatus();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сохранить пароль."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <section className={cn("password-security", className)}>
      <div className="password-security__head">
        <h3>Безопасность входа</h3>
        <span>{statusText}</span>
      </div>

      {loading ? (
        <div className="password-security__loading">
          <CircularProgress size={18} />
          <span>Обновляем статус пароля…</span>
        </div>
      ) : (
        <>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}

          <div className="password-security__quick-actions">
            <Button
              variant="outlined"
              startIcon={<KeyRoundedIcon fontSize="small" />}
              className="password-security__quick-btn"
              onClick={openCreatePanel}
              disabled={Boolean(status?.hasPassword)}
            >
              Создать пароль
            </Button>

            <Button
              variant="outlined"
              startIcon={<SyncLockRoundedIcon fontSize="small" />}
              className="password-security__quick-btn"
              onClick={openChangePanel}
              disabled={!status?.hasPassword}
            >
              Сменить пароль
            </Button>
          </div>

          {mode !== "closed" && (
            <div className="password-security__form">
              {mode === "change" && (
                <TextField
                  type={passwordInputType(showCurrentPassword)}
                  label="Текущий пароль"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  InputProps={{
                    endAdornment: getPasswordAdornment(
                      showCurrentPassword,
                      () => setShowCurrentPassword((prev) => !prev),
                      "Показать или скрыть текущий пароль"
                    ),
                  }}
                />
              )}

              <TextField
                type={passwordInputType(showNextPassword)}
                label={mode === "change" ? "Новый пароль" : "Задайте пароль"}
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  endAdornment: getPasswordAdornment(
                    showNextPassword,
                    () => setShowNextPassword((prev) => !prev),
                    "Показать или скрыть новый пароль"
                  ),
                }}
              />

              <TextField
                type={passwordInputType(showConfirmPassword)}
                label="Повторите пароль"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  endAdornment: getPasswordAdornment(
                    showConfirmPassword,
                    () => setShowConfirmPassword((prev) => !prev),
                    "Показать или скрыть подтверждение пароля"
                  ),
                }}
              />

              <p className="password-security__hint">
                Сложный пароль: 10-64 символа, только латиница, заглавная и строчная буквы, цифра, спецсимвол, без пробелов.
              </p>

              <div className="password-security__actions">
                <Button
                  variant="outlined"
                  startIcon={<CloseRoundedIcon fontSize="small" />}
                  onClick={closePanel}
                  disabled={saving}
                >
                  Свернуть
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SaveRoundedIcon fontSize="small" />}
                  disabled={saving}
                  onClick={() => void handleSavePassword()}
                >
                  {saving
                    ? "Сохраняем…"
                    : mode === "change"
                    ? "Сменить пароль"
                    : "Сохранить пароль"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
