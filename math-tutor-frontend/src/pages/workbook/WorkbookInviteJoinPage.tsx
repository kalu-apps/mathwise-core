import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, CircularProgress, TextField } from "@mui/material";
import { joinWorkbookInvite, resolveWorkbookInvite } from "@/features/workbook/model/api";
import { useAuth } from "@/features/auth/model/AuthContext";
import { ApiError } from "@/shared/api/client";
import { t } from "@/shared/i18n";

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
  const [guestName, setGuestName] = useState("");
  const [guestNameError, setGuestNameError] = useState<string | null>(null);

  const canJoin = useMemo(
    () =>
      Boolean(
        token &&
          !state.loading &&
          !state.error &&
          (user || guestName.trim().length >= 2)
      ),
    [guestName, state.error, state.loading, token, user]
  );

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      if (!token) {
        if (!active) return;
        setState((prev) => ({
            ...prev,
            loading: false,
            error: t("workbookInvite.invalidLink"),
          }));
        return;
      }
      try {
        const info = await resolveWorkbookInvite(token);
        if (!active) return;
        if (info.ended) {
          setState((prev) => ({
                ...prev,
                loading: false,
                error: t("workbookInvite.ended"),
                title: info.title,
                hostName: info.hostName,
                sessionId: info.sessionId,
          }));
          return;
        }
        if (info.expired || info.revoked) {
          setState((prev) => ({
                ...prev,
                loading: false,
                error: t("workbookInvite.inactive"),
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
            error: t("workbookInvite.resolveError"),
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
      if (!user && guestName.trim().length < 2) {
      setGuestNameError(t("workbookInvite.guestNameRequired"));
      return;
    }
    setGuestNameError(null);
    setBlockedSessionUrl(null);
    const preparedTab = window.open("", "_blank");
    try {
      setState((prev) => ({ ...prev, loading: true }));
      const joined = await joinWorkbookInvite(token, user ? undefined : guestName.trim());
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
        if (user) {
          navigate("/workbook", { replace: true });
        } else {
          window.location.assign("/");
        }
        return;
      }
      setState((prev) => ({
            ...prev,
            loading: false,
            error: t("workbookInvite.popupBlocked"),
          }));
      setBlockedSessionUrl(targetUrl);
      return;
    } catch (error) {
      if (preparedTab && !preparedTab.closed) preparedTab.close();
      const detailsMessage =
        error instanceof ApiError &&
        typeof error.details === "object" &&
        error.details &&
        "error" in error.details &&
        typeof (error.details as { error?: unknown }).error === "string"
          ? (error.details as { error: string }).error
          : null;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: detailsMessage ?? t("workbookInvite.joinError"),
      }));
    }
  };

  return (
    <section className="workbook-invite">
      <article className="workbook-invite__card">
        <h1>{t("workbookInvite.title")}</h1>
        {state.loading ? (
          <div className="workbook-invite__loading">
            <CircularProgress size={24} />
            <span>{t("workbookInvite.checkingInvite")}</span>
          </div>
        ) : null}
        {state.error ? <Alert severity="error">{state.error}</Alert> : null}
        {blockedSessionUrl ? (
          <Alert severity="warning">
            {t("workbookInvite.manualOpen")}:{" "}
            <a href={blockedSessionUrl} target="_blank" rel="noopener noreferrer">
              {t("workbookInvite.manualOpenAction")}
            </a>
            .
          </Alert>
        ) : null}
        {!state.loading && !state.error ? (
          <div className="workbook-invite__meta">
            <p>
              {t("workbookInvite.sessionLabel")}: <strong>{state.title}</strong>
            </p>
            <p>
              {t("workbookInvite.teacherLabel")}: <strong>{state.hostName}</strong>
            </p>
            {!user ? (
              <TextField
                size="small"
                label={t("workbookInvite.guestNameLabel")}
                value={guestName}
                onChange={(event) => {
                  setGuestName(event.target.value);
                  if (guestNameError) setGuestNameError(null);
                }}
                error={Boolean(guestNameError)}
                helperText={guestNameError ?? t("workbookInvite.guestNameHint")}
              />
            ) : null}
          </div>
        ) : null}
        {!state.loading ? (
          <div className="workbook-invite__actions">
            <Button variant="outlined" onClick={() => navigate(user ? "/workbook" : "/")}>
              {t("workbookInvite.openWorkbook")}
            </Button>
            <Button
              variant="contained"
              onClick={() => void handleJoin()}
              disabled={!canJoin || state.joined}
            >
              {t("workbookInvite.join")}
            </Button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
