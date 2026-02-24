import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, CircularProgress } from "@mui/material";
import { joinWorkbookInvite, resolveWorkbookInvite } from "@/features/workbook/model/api";
import { useAuth } from "@/features/auth/model/AuthContext";

export default function WorkbookInviteJoinPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    title: string;
    hostName: string;
    sessionId: string | null;
    joined: boolean;
  }>({
    loading: true,
    error: null,
    title: "",
    hostName: "",
    sessionId: null,
    joined: false,
  });
  const [blockedSessionUrl, setBlockedSessionUrl] = useState<string | null>(null);

  const canJoin = useMemo(
    () => Boolean(user && token && !state.loading && !state.error),
    [state.error, state.loading, token, user]
  );

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      if (!token) {
        if (!active) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Некорректная ссылка приглашения.",
        }));
        return;
      }
      try {
        const info = await resolveWorkbookInvite(token);
        if (!active) return;
        if (info.expired || info.revoked) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Ссылка приглашения недействительна.",
            title: info.title,
            hostName: info.hostName,
            sessionId: info.sessionId,
          }));
          return;
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
          title: info.title,
          hostName: info.hostName,
          sessionId: info.sessionId,
        }));
      } catch {
        if (!active) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Не удалось проверить ссылку приглашения.",
        }));
      }
    };
    void resolve();
    return () => {
      active = false;
    };
  }, [token]);

  const handleJoin = async () => {
    if (!token) return;
    setBlockedSessionUrl(null);
    const preparedTab = window.open("", "_blank");
    try {
      setState((prev) => ({ ...prev, loading: true }));
      const joined = await joinWorkbookInvite(token);
      const targetPath = `/workbook/session/${encodeURIComponent(joined.session.id)}`;
      const targetUrl = `${window.location.origin}${targetPath}`;
      setState((prev) => ({
        ...prev,
        loading: false,
        joined: true,
        sessionId: joined.session.id,
      }));
      if (preparedTab && !preparedTab.closed) {
        try {
          preparedTab.opener = null;
        } catch {
          // no-op
        }
        preparedTab.location.href = targetUrl;
        try {
          preparedTab.focus();
        } catch {
          // ignore browser focus restrictions
        }
        navigate("/workbook", { replace: true });
        return;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error:
          "Подключение выполнено, но браузер заблокировал новую вкладку. Разрешите pop-up и откройте сессию из раздела рабочей тетради.",
      }));
      setBlockedSessionUrl(targetUrl);
      return;
    } catch {
      if (preparedTab && !preparedTab.closed) preparedTab.close();
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Не удалось подключиться к коллективной сессии.",
      }));
    }
  };

  return (
    <section className="workbook-invite">
      <article className="workbook-invite__card">
        <h1>Подключение к рабочей тетради</h1>
        {state.loading ? (
          <div className="workbook-invite__loading">
            <CircularProgress size={24} />
            <span>Проверяем приглашение...</span>
          </div>
        ) : null}
        {state.error ? <Alert severity="error">{state.error}</Alert> : null}
        {blockedSessionUrl ? (
          <Alert severity="warning">
            Открыть вручную:{" "}
            <a href={blockedSessionUrl} target="_blank" rel="noopener noreferrer">
              перейти в сессию в новой вкладке
            </a>
            .
          </Alert>
        ) : null}
        {!state.loading && !state.error ? (
          <div className="workbook-invite__meta">
            <p>
              Сессия: <strong>{state.title}</strong>
            </p>
            <p>
              Преподаватель: <strong>{state.hostName}</strong>
            </p>
          </div>
        ) : null}
        {!state.loading ? (
          <div className="workbook-invite__actions">
            <Button variant="outlined" onClick={() => navigate("/workbook")}>
              К рабочим тетрадям
            </Button>
            <Button
              variant="contained"
              onClick={() => void handleJoin()}
              disabled={!canJoin || state.joined}
            >
              Подключиться
            </Button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
