import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { ApiError, api } from "@/shared/api/client";

type StageAccessStatus = {
  enabled: boolean;
  granted: boolean;
  expiresAt: string | null;
  marker?: string;
};

type StageAccessVerifyResponse = StageAccessStatus & {
  ok: true;
};

const CLOSED_FALLBACK: StageAccessStatus = {
  enabled: true,
  granted: false,
  expiresAt: null,
};

export function StageAccessGateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StageAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<StageAccessStatus>("/stage-access/status", {
        dedupe: false,
        cacheTtlMs: 0,
      });
      setStatus(payload);
    } catch (value) {
      if (value instanceof ApiError && value.status === 404) {
        setStatus({
          enabled: false,
          granted: true,
          expiresAt: null,
        });
      } else {
        setStatus(CLOSED_FALLBACK);
        setError(
          value instanceof Error
            ? value.message
            : "Не удалось проверить stage-доступ."
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleVerify = useCallback(async () => {
    if (!secret.trim()) {
      setError("Введите stage access secret.");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const result = await api.post<StageAccessVerifyResponse>(
        "/stage-access/verify",
        { secret },
        { notifyDataUpdate: false }
      );
      setStatus(result);
      setSecret("");
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Не удалось подтвердить stage-доступ."
      );
    } finally {
      setVerifying(false);
    }
  }, [secret]);

  const handleGateLogout = useCallback(async () => {
    try {
      const result = await api.post<StageAccessVerifyResponse>(
        "/stage-access/logout",
        {},
        { notifyDataUpdate: false }
      );
      setStatus(result);
      setError(null);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Не удалось завершить stage-доступ."
      );
    }
  }, []);

  if (loading || !status) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(circle at 20% 20%, rgba(27,164,140,.18), transparent 50%), #0a0f1a",
        }}
      >
        <Stack spacing={1} alignItems="center">
          <CircularProgress size={30} />
          <Typography color="white">Проверяем stage access gate…</Typography>
        </Stack>
      </Box>
    );
  }

  if (!status.enabled || status.granted) {
    return (
      <>
        {children}
        {status.enabled ? (
          <Box
            sx={{
              position: "fixed",
              right: 12,
              bottom: 12,
              zIndex: 2000,
            }}
          >
            <Button
              size="small"
              variant="outlined"
              onClick={() => void handleGateLogout()}
            >
              Stage Gate Logout
            </Button>
          </Box>
        ) : null}
      </>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: 2,
        background:
          "radial-gradient(circle at 20% 20%, rgba(27,164,140,.2), transparent 50%), #0a0f1a",
      }}
    >
      <Paper sx={{ p: 3, maxWidth: 440, width: "100%" }}>
        <Stack spacing={2}>
          <Typography variant="h6">Stage Site Access</Typography>
          <TextField
            label="Stage access secret"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            type="password"
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleVerify();
              }
            }}
          />
          {error ? <Alert severity="warning">{error}</Alert> : null}
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              disabled={verifying}
              onClick={() => void handleVerify()}
            >
              {verifying ? "Проверяем…" : "Открыть stage"}
            </Button>
            <Button
              variant="text"
              disabled={verifying}
              onClick={() => void loadStatus()}
            >
              Обновить статус
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
