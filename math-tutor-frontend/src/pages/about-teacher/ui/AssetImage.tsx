import { useEffect, useState, type CSSProperties } from "react";
import clsx from "clsx";

type AssetImageProps = {
  src?: string | null;
  alt: string;
  ratio?: string;
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
  className,
  loading = "lazy",
  onClick,
  showFallback = true,
  fallbackText = "Нет изображения",
}: AssetImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [src]);

  const hasSource = Boolean(src) && !errored;

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
          onLoad={() => setLoaded(true)}
          onError={() => {
            setErrored(true);
            setLoaded(false);
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
