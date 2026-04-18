import { useMemo, useState } from "react";
import { Dialog, IconButton } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import type { AboutTeacherAsset } from "../model/types";

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
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      className="about-teacher-lightbox"
    >
      <div className="about-teacher-lightbox__header">
        <span>{current?.fileName ?? "Диплом"}</span>
        <IconButton aria-label="Закрыть превью диплома" onClick={onClose}>
          <CloseRoundedIcon />
        </IconButton>
      </div>

      <div className="about-teacher-lightbox__stage">
        {diplomas.length > 1 ? (
          <IconButton aria-label="Предыдущий диплом" onClick={() => move("prev")}>
            <ChevronLeftRoundedIcon />
          </IconButton>
        ) : null}
        <div className="about-teacher-lightbox__canvas">
          {current?.url && !isCurrentErrored ? (
            <img
              src={current.url}
              alt="Просмотр диплома"
              onLoad={() => {
                if (current.url === erroredUrl) {
                  setErroredUrl(null);
                }
              }}
              onError={() => setErroredUrl(current.url)}
            />
          ) : (
            <div className="about-teacher-lightbox__fallback">
              Не удалось загрузить изображение диплома.
            </div>
          )}
        </div>
        {diplomas.length > 1 ? (
          <IconButton aria-label="Следующий диплом" onClick={() => move("next")}>
            <ChevronRightRoundedIcon />
          </IconButton>
        ) : null}
      </div>
    </Dialog>
  );
}
