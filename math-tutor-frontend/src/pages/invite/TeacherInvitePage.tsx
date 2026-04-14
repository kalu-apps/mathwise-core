import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
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
import { OnboardingFlowPanel } from "@/shared/ui/OnboardingFlowPanel";
import { formatRuPhoneInput } from "@/shared/lib/phone";

type InviteState = "active" | "expired" | "consumed" | "revoked" | "invalid";

const inviteStateMessage: Record<InviteState, string> = {
  active: "Приглашение активно. Можно продолжить onboarding.",
  expired: "Срок действия приглашения истек. Попросите преподавателя отправить новую ссылку.",
  consumed: "Это приглашение уже было использовано.",
  revoked: "Приглашение отозвано преподавателем.",
  invalid: "Ссылка-приглашение недействительна.",
};

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
        state: InviteState;
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

  const inviteFlowSteps = useMemo(() => {
    const state = status?.state ?? "invalid";
    return [
      {
        key: "inspect",
        title: "1. Проверка ссылки",
        description: "Система валидирует токен, TTL и одноразовость приглашения.",
        state: loading ? "current" : state === "active" ? "done" : "blocked",
      },
      {
        key: "identity",
        title: "2. Вход или регистрация",
        description:
          "Новый ученик проходит регистрацию, существующий пользователь входит в свой аккаунт.",
        state:
          state !== "active"
            ? "pending"
            : user
            ? "done"
            : "current",
      },
      {
        key: "accept",
        title: "3. Привязка к преподавателю",
        description:
          "После подтверждения аккаунт безопасно связывается с teacher-student контуром.",
        state:
          state !== "active"
            ? "pending"
            : submitting
            ? "current"
            : "pending",
      },
    ] as const;
  }, [loading, status?.state, submitting, user]);

  const loadInvite = useCallback(async () => {
    if (!token) {
      setError(inviteStateMessage.invalid);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const info = await inspectTeacherInvite(token);
      const teacherName = info.teacher
        ? `${info.teacher.firstName} ${info.teacher.lastName}`.trim() || "Преподаватель"
        : "Преподаватель";
      setStatus({
        inviteId: info.inviteId,
        state: info.status,
        teacherName,
        teacherPhoto: info.teacher?.photo,
        targetEmailMasked: info.targetEmailMasked,
      });
      if (info.status !== "active") {
        setError(inviteStateMessage[info.status]);
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
      const normalizedEmail = email.trim().toLowerCase();
      const payload = user
        ? { token }
        : {
            token,
            registration: {
              email: normalizedEmail,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: phone.trim(),
              password,
            },
          };
      const accepted = await acceptTeacherInvite(payload);
      if (!user && accepted.sessionEstablished) {
        updateUser({
          id: accepted.studentId,
          role: "student",
          email: normalizedEmail,
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

  const canSubmitRegistration =
    Boolean(email.trim()) &&
    Boolean(firstName.trim()) &&
    Boolean(lastName.trim()) &&
    Boolean(password.trim());

  return (
    <Box className="invite-page">
      <Paper className="invite-page__card" elevation={4}>
        <Stack spacing={2.2}>
          <OnboardingFlowPanel
            kicker="Teacher invite"
            title="Принятие приглашения преподавателя"
            description="Этот flow создает или связывает аккаунт ученика без дублирования профилей."
            steps={inviteFlowSteps}
            className="invite-page__flow"
          />

          {status ? (
            <Stack direction="row" spacing={1.4} alignItems="center" className="invite-page__teacher">
              <Avatar src={status.teacherPhoto} alt={status.teacherName} sx={{ width: 44, height: 44 }}>
                {status.teacherName.slice(0, 1)}
              </Avatar>
              <div>
                <Typography variant="body2" className="invite-page__teacher-label">
                  Вас приглашает
                </Typography>
                <Typography variant="h6" className="invite-page__teacher-name">
                  {status.teacherName}
                </Typography>
                {status.targetEmailMasked ? (
                  <Typography variant="caption" color="text.secondary">
                    Приглашение закреплено за email: {status.targetEmailMasked}
                  </Typography>
                ) : null}
              </div>
            </Stack>
          ) : null}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={28} />
            </Box>
          ) : null}

          {!loading && status ? (
            <Alert severity={status.state === "active" ? "info" : "warning"}>
              {inviteStateMessage[status.state]}
            </Alert>
          ) : null}

          {!loading && error ? <Alert severity="error">{error}</Alert> : null}

          {!loading && !error && status?.state === "active" ? (
            <>
              {user ? (
                <>
                  <Alert severity="success">
                    Вы вошли как <strong>{user.email}</strong>. Подтвердите принятие приглашения.
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
                    Если аккаунт уже существует, сначала войдите в него. Для нового ученика заполните форму ниже.
                  </Alert>

                  <Button
                    variant="outlined"
                    onClick={() => {
                      openAuthModal("invite");
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
                    InputLabelProps={{ shrink: true }}
                  />

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                    <TextField
                      label="Имя"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      label="Фамилия"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Stack>

                  <TextField
                    label="Телефон (необязательно)"
                    value={formatRuPhoneInput(phone)}
                    onChange={(event) => setPhone(formatRuPhoneInput(event.target.value))}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />

                  <TextField
                    label="Пароль"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    fullWidth
                    helperText="10-64 символа, латиница, верхний и нижний регистр, цифра и спецсимвол."
                    InputLabelProps={{ shrink: true }}
                  />

                  <Button
                    variant="contained"
                    onClick={() => {
                      void submitAccept();
                    }}
                    disabled={submitting || !canSubmitRegistration}
                  >
                    {submitting ? "Регистрируем..." : "Зарегистрироваться и принять"}
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
