import { useState, type CSSProperties } from "react";
import clsx from "clsx";

type AssetImageProps = {
  src?: string | null;
  alt: string;
  ratio?: string;
  fit?: "cover" | "contain";
  className?: string;
  loading?: "lazy" | "eager";
  onClick?: () => void;
  showFallback?: boolean;
  fallbackText?: string;
};

export function AssetImage({
  src,
  alt,
  ratio = "4 / 3",
  fit = "cover",
  className,
  loading = "lazy",
  onClick,
  showFallback = true,
  fallbackText = "Нет изображения",
}: AssetImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);

  const hasSource = Boolean(src) && src !== erroredSrc;
  const loaded = Boolean(src) && src === loadedSrc && hasSource;

  return (
    <div
      className={clsx("about-teacher-asset", className, {
        "is-loaded": loaded,
        "is-error": !hasSource,
        "is-clickable": Boolean(onClick),
      })}
      style={
        {
          "--about-teacher-asset-ratio": ratio,
          "--about-teacher-asset-fit": fit,
        } as CSSProperties
      }
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      {hasSource ? (
        <img
          src={src ?? undefined}
          alt={alt}
          loading={loading}
          onLoad={() => {
            setLoadedSrc(src ?? null);
            if (src && erroredSrc === src) {
              setErroredSrc(null);
            }
          }}
          onError={() => {
            setErroredSrc(src ?? null);
            if (src && loadedSrc === src) {
              setLoadedSrc(null);
            }
          }}
        />
      ) : null}
      {!loaded && hasSource ? (
        <span className="about-teacher-asset__skeleton" aria-hidden="true" />
      ) : null}
      {!hasSource && showFallback ? (
        <span className="about-teacher-asset__fallback" aria-label={`${alt} недоступно`}>
          {fallbackText}
        </span>
      ) : null}
      {!hasSource && !showFallback ? (
        <span className="about-teacher-asset__skeleton" aria-hidden="true" />
      ) : null}
    </div>
  );
}
