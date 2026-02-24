import { Avatar, IconButton, Tooltip } from "@mui/material";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import { formatRuPhoneDisplay } from "@/shared/lib/phone";

type Props = {
  name: string;
  email: string;
  phone?: string;
  photo?: string;
  onViewProfile: () => void;
  onOpenChat?: () => void;
  showChatAction?: boolean;
};

export function StudentCard({
  name,
  email,
  phone,
  photo,
  onViewProfile,
  onOpenChat,
  showChatAction = false,
}: Props) {
  const formattedPhone = formatRuPhoneDisplay(phone);
  return (
    <div className="student-card">
      <div className="student-card__header">
        <Avatar src={photo} className="student-card__avatar">
          {name.charAt(0).toUpperCase()}
        </Avatar>

        <div className="student-card__info">
          <div className="student-card__name">{name}</div>
          <div className="student-card__email">{email}</div>
          <div className="student-card__phone">
            {formattedPhone ? `Телефон: ${formattedPhone}` : "Телефон не указан"}
          </div>
        </div>

        <div className="student-card__actions">
          {showChatAction && onOpenChat ? (
            <Tooltip title="Открыть чат со студентом">
              <IconButton
                className="student-card__action"
                onClick={onOpenChat}
                aria-label="Открыть чат со студентом"
              >
                <ForumRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          <Tooltip title="Профиль студента">
            <IconButton
              className="student-card__action"
              onClick={onViewProfile}
              aria-label="Открыть профиль студента"
            >
              <OpenInNewRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
