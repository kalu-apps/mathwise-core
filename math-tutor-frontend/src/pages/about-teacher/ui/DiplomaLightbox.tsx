import { useMemo, useState } from "react";
import type { AboutTeacherAsset } from "../model/types";
import { ImmersiveMediaOverlay } from "@/shared/ui/ImmersiveMediaOverlay";

type DiplomaLightboxProps = {
  diplomas: AboutTeacherAsset[];
  openIndex: number | null;
  onClose: () => void;
  onSetIndex: (index: number) => void;
};

export function DiplomaLightbox({
  diplomas,
  openIndex,
  onClose,
  onSetIndex,
}: DiplomaLightboxProps) {
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  const open = openIndex !== null && openIndex >= 0 && openIndex < diplomas.length;
  const current = useMemo(
    () => (open && openIndex !== null ? diplomas[openIndex] : null),
    [diplomas, open, openIndex]
  );
  const isCurrentErrored = Boolean(current?.url) && current?.url === erroredUrl;

  const move = (direction: "next" | "prev") => {
    if (!open || openIndex === null) return;
    const delta = direction === "next" ? 1 : -1;
    const target = (openIndex + delta + diplomas.length) % diplomas.length;
    onSetIndex(target);
  };

  return (
    <ImmersiveMediaOverlay
      open={open}
      onClose={onClose}
      onPrev={diplomas.length > 1 ? () => move("prev") : undefined}
      onNext={diplomas.length > 1 ? () => move("next") : undefined}
      ariaLabel="Просмотр диплома"
      closeLabel="Закрыть просмотр диплома"
      prevLabel="Предыдущий диплом"
      nextLabel="Следующий диплом"
    >
      {current?.url && !isCurrentErrored ? (
        <img
          src={current.url}
          alt="Просмотр диплома"
          className="immersive-media-overlay__media"
          onLoad={() => {
            if (current.url === erroredUrl) {
              setErroredUrl(null);
            }
          }}
          onError={() => setErroredUrl(current.url)}
        />
      ) : (
        <div className="immersive-media-overlay__fallback">
          Не удалось загрузить изображение диплома.
        </div>
      )}
    </ImmersiveMediaOverlay>
  );
}
