import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { t } from "@/shared/i18n";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = t("confirmDialog.confirm"),
  cancelText = t("confirmDialog.cancel"),
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const mobileActionSx = isMobile
    ? {
        minWidth: 44,
        width: 44,
        height: 44,
        padding: 0.9,
        borderRadius: 2.5,
        flex: "0 0 auto",
      }
    : undefined;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      fullWidth
      maxWidth="xs"
      className="ui-dialog ui-dialog--compact ui-confirm-dialog"
    >
      <DialogTitleWithClose
        title={title}
        onClose={onCancel}
        className="ui-confirm-dialog__title"
        closeAriaLabel={t("common.close")}
      />

      {description && (
        <DialogContent className="ui-confirm-dialog__content">
          <Typography color="text.secondary">{description}</Typography>
        </DialogContent>
      )}

      <DialogActions className="ui-confirm-dialog__actions">
        <Button
          onClick={onCancel}
          size="large"
          sx={mobileActionSx}
          aria-label={isMobile ? cancelText : undefined}
        >
          {isMobile ? <CloseRoundedIcon fontSize="small" /> : cancelText}
        </Button>

        <Button
          variant="contained"
          color={danger ? "error" : "primary"}
          onClick={onConfirm}
          size="large"
          sx={mobileActionSx}
          aria-label={isMobile ? confirmText : undefined}
        >
          {isMobile ? <CheckRoundedIcon fontSize="small" /> : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
