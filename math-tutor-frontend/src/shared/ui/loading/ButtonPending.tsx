import { CircularProgress } from "@mui/material";
import type { ReactNode } from "react";

type ButtonPendingProps = {
  loading: boolean;
  children: ReactNode;
  loadingLabel?: string;
  spinnerSize?: number;
  className?: string;
};

export function ButtonPending({
  loading,
  children,
  loadingLabel = "Загрузка...",
  spinnerSize = 16,
  className,
}: ButtonPendingProps) {
  return (
    <span className={["ui-loader-button", className].filter(Boolean).join(" ")}>
      {loading ? (
        <>
          <CircularProgress size={spinnerSize} color="inherit" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}
