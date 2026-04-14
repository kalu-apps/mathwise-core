import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  acceptTeacherInvite,
  inspectTeacherInvite,
} from "@/entities/profile/model/storage";

export default function TeacherInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, updateUser, openAuthModal } = useAuth();

  const token = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    | {
        inviteId: string | null;
        state: "active" | "expired" | "consumed" | "revoked" | "invalid";
        teacherName: string;
        teacherPhoto?: string;
        targetEmailMasked?: string;
      }
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const loadInvite = useCallback(async () => {
    if (!token) {
      setError("Ссылка-приглашение недействительна.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const info = await inspectTeacherInvite(token);
      setStatus({
        inviteId: info.inviteId,
        state: info.status,
        teacherName: info.teacher
          ? `${info.teacher.firstName} ${info.teacher.lastName}`.trim() ||
            "Преподаватель"
          : "Преподаватель",
        teacherPhoto: info.teacher?.photo,
        targetEmailMasked: info.targetEmailMasked,
      });
      if (info.status !== "active") {
        setError(
          info.status === "expired"
            ? "Срок действия приглашения истек."
            : info.status === "consumed"
              ? "Это приглашение уже использовано."
              : info.status === "revoked"
                ? "Приглашение отозвано преподавателем."
                : "Ссылка-приглашение недействительна."
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось проверить приглашение.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite]);

  const submitAccept = useCallback(async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = user
        ? { token }
        : {
            token,
            registration: {
              email,
              firstName,
              lastName,
              phone,
              password,
            },
          };
      const accepted = await acceptTeacherInvite(payload);
      if (!user && accepted.sessionEstablished) {
        updateUser({
          id: accepted.studentId,
          role: "student",
          email: email.trim(),
          firstName: firstName.trim() || "Ученик",
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          photo: undefined,
        });
      }
      navigate(accepted.nextPath || "/booking", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось принять приглашение.");
    } finally {
      setSubmitting(false);
    }
  }, [email, firstName, lastName, navigate, password, phone, token, updateUser, user]);

  return (
    <Box
      sx={{
        minHeight: "calc(100vh - 72px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 4,
      }}
    >
      <Paper sx={{ p: 3, width: "100%", maxWidth: 560, borderRadius: 3 }} elevation={4}>
        <Stack spacing={2.2}>
          <Typography variant="h5" fontWeight={700}>
            Приглашение преподавателя
          </Typography>
          {status ? (
            <Typography variant="body2" color="text.secondary">
              Вас приглашает: <strong>{status.teacherName}</strong>
            </Typography>
          ) : null}
          {status?.targetEmailMasked ? (
            <Typography variant="body2" color="text.secondary">
              Приглашение закреплено за email: <strong>{status.targetEmailMasked}</strong>
            </Typography>
          ) : null}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={28} />
            </Box>
          ) : null}

          {!loading && error ? <Alert severity="error">{error}</Alert> : null}

          {!loading && !error && status?.state === "active" ? (
            <>
              {user ? (
                <>
                  <Alert severity="info">
                    Вы вошли как <strong>{user.email}</strong>. Нажмите кнопку ниже, чтобы принять приглашение.
                  </Alert>
                  <Button
                    variant="contained"
                    onClick={() => {
                      void submitAccept();
                    }}
                    disabled={submitting}
                  >
                    {submitting ? "Подтверждаем..." : "Принять приглашение"}
                  </Button>
                </>
              ) : (
                <>
                  <Alert severity="info">
                    Если у вас уже есть аккаунт, войдите в него. Если аккаунта нет, заполните форму ниже.
                  </Alert>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      openAuthModal();
                    }}
                  >
                    Войти в существующий аккаунт
                  </Button>
                  <TextField
                    label="Email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    fullWidth
                  />
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                    <TextField
                      label="Имя"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Фамилия"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      fullWidth
                    />
                  </Stack>
                  <TextField
                    label="Телефон (необязательно)"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Пароль"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    fullWidth
                    helperText="Минимум 10 символов, буквы в разном регистре, цифра и спецсимвол."
                  />
                  <Button
                    variant="contained"
                    onClick={() => {
                      void submitAccept();
                    }}
                    disabled={submitting}
                  >
                    {submitting ? "Создаем аккаунт..." : "Зарегистрироваться и принять"}
                  </Button>
                </>
              )}
            </>
          ) : null}
        </Stack>
      </Paper>
    </Box>
  );
}
