import type { ReactElement } from "react";
import AutoGraphRoundedIcon from "@mui/icons-material/AutoGraphRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";
import ArrowOutwardRoundedIcon from "@mui/icons-material/ArrowOutwardRounded";
import { Button } from "@mui/material";
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
  return (
    <section className="home-first-screen__paths" aria-label="Маршруты старта">
      <div className="home-first-screen__paths-head">
        <h2>Выберите удобный путь старта</h2>
        <p>
          Один основной путь и два быстрых сценария под конкретную задачу.
        </p>
      </div>

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
                <span className="home-first-screen__path-kicker">
                  {isPrimary ? "Рекомендуем" : "Дополнительно"}
                </span>
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
