import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  InputAdornment,
  TextField,
} from "@mui/material";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { completeFirstPassword } from "@/features/auth/model/api";
import { ButtonPending } from "@/shared/ui/loading";
import { Notice } from "@/shared/ui/Notice";

const validateStrongPassword = (password: string): string | null => {
  if (password.length < 10) {
    return "Минимальная длина пароля — 10 символов.";
  }
  if (password.length > 64) {
    return "Максимальная длина пароля — 64 символа.";
  }
  if (/\s/.test(password)) {
    return "Пароль не должен содержать пробелы.";
  }
  if (!/^[\x21-\x7E]+$/.test(password)) {
    return "Используйте только латиницу, цифры и специальные символы.";
  }
  if (!/[a-z]/.test(password)) {
    return "Добавьте хотя бы одну строчную букву.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Добавьте хотя бы одну заглавную букву.";
  }
  if (!/\d/.test(password)) {
    return "Добавьте хотя бы одну цифру.";
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return "Добавьте хотя бы один специальный символ.";
  }
  return null;
};

type FirstPasswordDialogProps = {
  open: boolean;
  onCompleted: () => void;
  statusError?: string | null;
};

export function FirstPasswordDialog({
  open,
  onCompleted,
  statusError = null,
}: FirstPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirmPassword("");
    setSaving(false);
    setError(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [open]);

  const passwordAdornment = (
    visible: boolean,
    onToggle: () => void,
    label: string
  ) => (
    <InputAdornment position="end">
      <IconButton
        className="first-password-dialog__visibility-btn"
        onClick={onToggle}
        edge="end"
        size="small"
        aria-label={label}
      >
        {visible ? (
          <VisibilityOffRoundedIcon fontSize="small" />
        ) : (
          <VisibilityRoundedIcon fontSize="small" />
        )}
      </IconButton>
    </InputAdornment>
  );

  const handleSubmit = async () => {
    setError(null);

    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (!confirmPassword) {
      setError("Повторите новый пароль.");
      return;
    }

    if (confirmPassword !== password) {
      setError("Пароли не совпадают.");
      return;
    }

    setSaving(true);
    try {
      const response = await completeFirstPassword(password);
      if (!response.ok) {
        setError(response.message || "Не удалось сохранить пароль.");
        return;
      }
      onCompleted();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сохранить пароль. Попробуйте снова."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      maxWidth="sm"
      fullWidth
      className="ui-dialog ui-dialog--compact first-password-dialog"
      disableEscapeKeyDown
    >
      <DialogContent className="first-password-dialog__content">
        <header className="first-password-dialog__header">
          <h2 className="first-password-dialog__title">Создайте пароль</h2>
          <p className="first-password-dialog__subtitle">
            Это последний шаг для входа по email и паролю.
          </p>
        </header>

        {statusError ? (
          <Notice tone="warning" density="compact">{statusError}</Notice>
        ) : null}
        {error ? <Notice tone="critical" density="compact">{error}</Notice> : null}

        <div className="first-password-dialog__fields">
          <TextField
            label="Новый пароль"
            type={showPassword ? "text" : "password"}
            fullWidth
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            InputProps={{
              endAdornment: passwordAdornment(
                showPassword,
                () => setShowPassword((prev) => !prev),
                "Показать или скрыть новый пароль"
              ),
            }}
          />

          <TextField
            label="Повторите пароль"
            type={showConfirmPassword ? "text" : "password"}
            fullWidth
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            InputProps={{
              endAdornment: passwordAdornment(
                showConfirmPassword,
                () => setShowConfirmPassword((prev) => !prev),
                "Показать или скрыть подтверждение пароля"
              ),
            }}
          />
        </div>

        <p className="first-password-dialog__hint">
          10-64 символа, латиница, минимум одна заглавная, одна строчная, цифра и спецсимвол.
        </p>
      </DialogContent>

      <DialogActions className="first-password-dialog__actions">
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={saving}>
          <ButtonPending loading={saving} loadingLabel="Сохраняем пароль...">
            Сохранить и продолжить
          </ButtonPending>
        </Button>
      </DialogActions>
    </Dialog>
  );
}
