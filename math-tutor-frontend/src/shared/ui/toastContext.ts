import { createContext, useContext, type ReactNode } from "react";
import type { NoticeAction, NoticeTone } from "./Notice";

export type ToastInput = {
  tone?: NoticeTone;
  title?: ReactNode;
  message?: ReactNode;
  action?: NoticeAction;
  durationMs?: number;
};

export type ToastContextValue = {
  notify: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
