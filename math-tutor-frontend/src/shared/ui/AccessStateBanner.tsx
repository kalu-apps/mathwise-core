import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import {
  getAccessGateActions,
  getAccessStateMeta,
  type AccessUiState,
} from "@/domain/auth-payments/model/ui";
import { t } from "@/shared/i18n";
import { Notice, type NoticeAction } from "./Notice";

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
  const noticeActions = actions.reduce<NoticeAction[]>((items, action) => {
      if (action === "recheck" && onRecheck) {
        items.push({
          label: t("access.recheck"),
          onClick: onRecheck,
          icon: <RefreshRoundedIcon fontSize="small" />,
        });
      }
      if (action === "recover" && onRecover) {
        items.push({
          label: t("access.recover"),
          onClick: onRecover,
          icon: <HelpOutlineRoundedIcon fontSize="small" />,
        });
      }
      if (action === "profile" && onCompleteProfile) {
        items.push({
          label: t("access.completeProfile"),
          onClick: onCompleteProfile,
          icon: <PersonRoundedIcon fontSize="small" />,
        });
      }
      if (action === "login" && onLogin) {
        items.push({
          label: t("access.login"),
          onClick: onLogin,
          icon: <LoginRoundedIcon fontSize="small" />,
        });
      }
      return items;
    }, []);

  if (noticeActions.length === 0 && meta.severity === "info") return null;

  return (
    <Notice
      tone={meta.severity === "warning" ? "warning" : "info"}
      density="compact"
      className="access-notice"
      actions={noticeActions}
    >
      {t(meta.messageKey)}
    </Notice>
  );
}
