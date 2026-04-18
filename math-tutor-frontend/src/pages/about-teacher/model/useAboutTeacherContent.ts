import { useEffect, useMemo, useState } from "react";
import { getPublicAboutTeacherContent } from "@/entities/profile/model/storage";
import type { AboutTeacherAsset } from "./types";

type AboutTeacherContentState = {
  loading: boolean;
  error: string | null;
  avatar: AboutTeacherAsset | null;
  diplomas: AboutTeacherAsset[];
  reviews: AboutTeacherAsset[];
};

const INITIAL_STATE: AboutTeacherContentState = {
  loading: true,
  error: null,
  avatar: null,
  diplomas: [],
  reviews: [],
};

const preloadImage = async (src: string) =>
  new Promise<void>((resolve) => {
    if (typeof Image === "undefined") {
      resolve();
      return;
    }
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });

export function useAboutTeacherContent() {
  const [state, setState] = useState<AboutTeacherContentState>(INITIAL_STATE);

  useEffect(() => {
    let canceled = false;

    const load = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const payload = await getPublicAboutTeacherContent();
        if (payload.avatar?.url) {
          await preloadImage(payload.avatar.url);
        }
        if (canceled) return;

        setState({
          loading: false,
          error: null,
          avatar: payload.avatar,
          diplomas: payload.diplomas,
          reviews: payload.reviews,
        });
      } catch (error) {
        if (canceled) return;
        setState({
          loading: false,
          error: "Не удалось загрузить материалы преподавателя. Попробуйте обновить страницу.",
          avatar: null,
          diplomas: [],
          reviews: [],
        });
        if (typeof console !== "undefined") {
          console.error("[about-teacher] failed-to-load-content", error);
        }
      }
    };

    void load();
    return () => {
      canceled = true;
    };
  }, []);

  const hasAnyAsset = useMemo(
    () => Boolean(state.avatar) || state.diplomas.length > 0 || state.reviews.length > 0,
    [state.avatar, state.diplomas.length, state.reviews.length]
  );

  return {
    ...state,
    hasAnyAsset,
  };
}
