import { Alert, Button } from "@mui/material";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import {
  getAccessGateActions,
  getAccessStateMeta,
  type AccessUiState,
} from "@/domain/auth-payments/model/ui";
import { t } from "@/shared/i18n";

type Props = {
  state: AccessUiState;
  onLogin?: () => void;
  onRecover?: () => void;
  onRecheck?: () => void;
  onCompleteProfile?: () => void;
};

export function AccessStateBanner({
  state,
  onLogin,
  onRecover,
  onRecheck,
  onCompleteProfile,
}: Props) {
  const meta = getAccessStateMeta(state);
  const actions = getAccessGateActions({
    state,
    hasLogin: Boolean(onLogin),
    hasRecover: Boolean(onRecover),
    hasRecheck: Boolean(onRecheck),
    hasProfile: Boolean(onCompleteProfile),
  });
  return (
    <Alert
      severity={meta.severity as "info" | "warning"}
      className="ui-alert"
      action={
        actions.length > 0 ? (
          <div className="ui-alert__actions">
            {actions.includes("recheck") && onRecheck && (
              <Button
                color="inherit"
                size="small"
                startIcon={<RefreshRoundedIcon fontSize="small" />}
                onClick={onRecheck}
              >
                {t("access.recheck")}
              </Button>
            )}
            {actions.includes("recover") && onRecover && (
              <Button
                color="inherit"
                size="small"
                startIcon={<HelpOutlineRoundedIcon fontSize="small" />}
                onClick={onRecover}
              >
                {t("access.recover")}
              </Button>
            )}
            {actions.includes("profile") && onCompleteProfile && (
              <Button
                color="inherit"
                size="small"
                startIcon={<PersonRoundedIcon fontSize="small" />}
                onClick={onCompleteProfile}
              >
                {t("access.completeProfile")}
              </Button>
            )}
            {actions.includes("login") && onLogin && (
              <Button
                color="inherit"
                size="small"
                startIcon={<LoginRoundedIcon fontSize="small" />}
                onClick={onLogin}
              >
                {t("access.login")}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {t(meta.messageKey)}
    </Alert>
  );
}
