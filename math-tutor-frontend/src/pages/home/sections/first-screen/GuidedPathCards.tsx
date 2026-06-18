import { useEffect, useState, type ReactElement } from "react";
import AutoGraphRoundedIcon from "@mui/icons-material/AutoGraphRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";
import ArrowOutwardRoundedIcon from "@mui/icons-material/ArrowOutwardRounded";
import { Button } from "@mui/material";
import { getPublicHomeHeroAsset } from "@/entities/profile/model/storage";
import type { HomeGuidedPath } from "./content";

type GuidedPathCardsProps = {
  paths: HomeGuidedPath[];
  onSelectPath: (route: string) => void;
};

const iconByPath: Record<HomeGuidedPath["icon"], ReactElement> = {
  catalog: <AutoGraphRoundedIcon fontSize="small" />,
  intensive: <EventAvailableRoundedIcon fontSize="small" />,
  support: <SupportAgentRoundedIcon fontSize="small" />,
};

export function GuidedPathCards({ paths, onSelectPath }: GuidedPathCardsProps) {
  const [routeAssetUrl, setRouteAssetUrl] = useState<string | null>(null);
  const [routeAssetFailed, setRouteAssetFailed] = useState(false);

  useEffect(() => {
    let canceled = false;

    const loadRouteAsset = async () => {
      try {
        const payload = await getPublicHomeHeroAsset();
        if (canceled) return;
        setRouteAssetUrl(payload.routeAsset?.url ?? null);
        setRouteAssetFailed(false);
      } catch (error) {
        if (canceled) return;
        setRouteAssetUrl(null);
        setRouteAssetFailed(true);
        if (typeof console !== "undefined") {
          console.error("[home] failed-to-load-route-asset", error);
        }
      }
    };

    void loadRouteAsset();
    return () => {
      canceled = true;
    };
  }, []);

  const shouldShowRouteAsset = Boolean(routeAssetUrl) && !routeAssetFailed;

  return (
    <section className="home-first-screen__paths" aria-label="Маршруты старта">
      {shouldShowRouteAsset ? (
        <div className="home-first-screen__route-asset" aria-hidden="true">
          <img
            src={routeAssetUrl ?? undefined}
            alt=""
            loading="eager"
            decoding="async"
            draggable={false}
            onError={() => setRouteAssetFailed(true)}
          />
        </div>
      ) : null}

      <div className="home-first-screen__paths-list">
        {paths.map((path) => {
          const isPrimary = path.tone === "primary";

          return (
            <article
              key={path.id}
              className={`home-first-screen__path-item ${
                isPrimary ? "home-first-screen__path-item--primary" : ""
              }`}
            >
              <div className="home-first-screen__path-topline">
                <span className="home-first-screen__path-icon">{iconByPath[path.icon]}</span>
              </div>

              <h3>{path.title}</h3>
              <p className="home-first-screen__path-summary">{path.summary}</p>
              <p className="home-first-screen__path-detail">{path.detail}</p>

              <Button
                variant={isPrimary ? "contained" : "text"}
                className={`home-first-screen__path-action ${
                  isPrimary ? "home-first-screen__path-action--primary" : ""
                }`}
                onClick={() => onSelectPath(path.route)}
                endIcon={<ArrowOutwardRoundedIcon fontSize="small" />}
              >
                {path.actionLabel}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
