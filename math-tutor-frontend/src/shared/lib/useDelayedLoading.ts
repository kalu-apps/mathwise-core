import { useEffect, useRef, useState } from "react";

type DelayedLoadingOptions = {
  delayMs?: number;
  minVisibleMs?: number;
};

const DEFAULT_DELAY_MS = 150;
const DEFAULT_MIN_VISIBLE_MS = 260;

export function useDelayedLoading(
  loading: boolean,
  options: DelayedLoadingOptions = {}
) {
  const delayMs = Math.max(0, options.delayMs ?? DEFAULT_DELAY_MS);
  const minVisibleMs = Math.max(0, options.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS);

  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  const delayTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (delayTimerRef.current) {
        window.clearTimeout(delayTimerRef.current);
      }
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (delayTimerRef.current) {
      window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (loading) {
      if (visible) return;
      delayTimerRef.current = window.setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delayMs);
      return;
    }

    if (!visible) {
      shownAtRef.current = null;
      return;
    }

    const shownAt = shownAtRef.current;
    const elapsed = shownAt ? Date.now() - shownAt : minVisibleMs;
    const remain = Math.max(0, minVisibleMs - elapsed);

    hideTimerRef.current = window.setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remain);
  }, [loading, visible, delayMs, minVisibleMs]);

  return visible;
}
