import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Notice } from "./Notice";
import { ToastContext, type ToastInput } from "./toastContext";

type ToastItem = ToastInput & {
  id: string;
};

const createToastId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (toast: ToastInput) => {
      const id = createToastId();
      setToasts((items) => [...items.slice(-2), { ...toast, id }]);
      const durationMs = toast.durationMs ?? 5200;
      if (durationMs > 0) {
        const timer = window.setTimeout(() => dismiss(id), durationMs);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="notice-toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <Notice
            key={toast.id}
            tone={toast.tone ?? "info"}
            placement="toast"
            density="compact"
            title={toast.title}
            actions={toast.action ? [toast.action] : undefined}
            onClose={() => dismiss(toast.id)}
          >
            {toast.message}
          </Notice>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
