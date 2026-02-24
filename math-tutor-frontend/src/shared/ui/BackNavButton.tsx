import { Button, type ButtonProps } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";

type BackNavButtonProps = Omit<ButtonProps, "variant" | "startIcon" | "children"> & {
  label?: string;
};

export function BackNavButton({
  label = "Назад",
  sx,
  ...rest
}: BackNavButtonProps) {
  return (
    <Button
      variant="contained"
      startIcon={<ArrowBackRoundedIcon fontSize="small" />}
      sx={{
        alignSelf: "flex-start",
        borderRadius: "999px",
        px: 2.1,
        py: 0.7,
        minHeight: 36,
        fontWeight: 700,
        letterSpacing: "0.01em",
        color: "var(--text-on-overlay)",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--brand-solid) 84%, #ffffff 4%), color-mix(in srgb, var(--feedback-info) 74%, var(--brand-soft) 20%))",
        boxShadow: "0 10px 22px color-mix(in srgb, var(--brand-solid) 32%, transparent)",
        border: "1px solid color-mix(in srgb, var(--brand-soft) 40%, transparent)",
        textTransform: "none",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: "0 14px 24px color-mix(in srgb, var(--brand-solid) 36%, transparent)",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--brand-solid) 88%, #ffffff 4%), color-mix(in srgb, var(--feedback-info) 78%, var(--brand-soft) 18%))",
        },
        "&:active": {
          transform: "translateY(0)",
        },
        ...sx,
      }}
      {...rest}
    >
      {label}
    </Button>
  );
}
