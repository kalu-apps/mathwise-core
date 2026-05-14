import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  acceptTeacherInvite,
  inspectTeacherInvite,
} from "@/entities/profile/model/storage";
import { formatRuPhoneInput } from "@/shared/lib/phone";
import { Notice } from "@/shared/ui/Notice";

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
        state: InviteState;
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
      setError(inviteStateMessage.invalid);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const info = await inspectTeacherInvite(token);
      setStatus({
        state: info.status,
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
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={28} />
            </Box>
          ) : null}

          {!loading && error ? (
            <Notice tone="critical" density="compact">{error}</Notice>
          ) : null}

          {!loading && !error && status?.state === "active" ? (
            <>
              {user ? (
                <>
                  <Notice tone="success" density="compact">
                    Вы вошли как <strong>{user.email}</strong>. Подтвердите принятие приглашения.
                  </Notice>
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
                  <Button
                    variant="outlined"
                    onClick={() => {
                      openAuthModal("invite");
                    }}
                  >
                    Войти в существующий аккаунт
                  </Button>

                  <TextField
                    placeholder="Email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    fullWidth
                  />

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                    <TextField
                      placeholder="Имя"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      fullWidth
                    />
                    <TextField
                      placeholder="Фамилия"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      fullWidth
                    />
                  </Stack>

                  <TextField
                    placeholder="Телефон (необязательно)"
                    value={formatRuPhoneInput(phone)}
                    onChange={(event) => setPhone(formatRuPhoneInput(event.target.value))}
                    fullWidth
                  />

                  <TextField
                    placeholder="Пароль"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    fullWidth
                    helperText="10-64 символа, латиница, верхний и нижний регистр, цифра и спецсимвол."
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
