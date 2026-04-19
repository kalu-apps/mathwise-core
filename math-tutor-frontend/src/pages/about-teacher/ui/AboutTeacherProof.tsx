import DirectionsRailwayRoundedIcon from "@mui/icons-material/DirectionsRailwayRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import { ABOUT_TEACHER_EDUCATION, ABOUT_TEACHER_METRICS } from "../model/content";
import type { AboutTeacherAsset } from "../model/types";
import { AssetImage } from "./AssetImage";

type AboutTeacherProofProps = {
  diplomas: AboutTeacherAsset[];
  onOpenDiploma: (index: number) => void;
};

export function AboutTeacherProof({ diplomas, onOpenDiploma }: AboutTeacherProofProps) {
  const primaryMetric = ABOUT_TEACHER_METRICS[0] ?? null;
  const primaryDiploma = diplomas[0] ?? null;
  const secondaryDiplomas = diplomas.slice(primaryDiploma ? 1 : 0);
  const educationIcons = [
    DirectionsRailwayRoundedIcon,
    SchoolRoundedIcon,
    WorkspacePremiumRoundedIcon,
  ] as const;

  return (
    <section className="about-teacher-proof" aria-labelledby="about-teacher-proof-title">
      <div className="about-teacher-proof__intro">
        <span className="about-teacher-proof__eyebrow">Опыт и квалификация</span>
        <h2 id="about-teacher-proof-title">Образование и подтверждённые дипломы</h2>
      </div>

      <div className="about-teacher-proof__body">
        <div className="about-teacher-proof__education-list" role="list" aria-label="Образовательные организации">
          {ABOUT_TEACHER_EDUCATION.map((item, index) => {
            const Icon = educationIcons[index % educationIcons.length];
            const variant = ((index % 3) + 1) as 1 | 2 | 3;
            return (
              <article
                key={`${item.title}_${item.years}`}
                className={`about-teacher-proof__education-card about-teacher-proof__education-card--v${variant}`}
                role="listitem"
              >
                <span className="about-teacher-proof__education-icon" aria-hidden="true">
                  <Icon fontSize="small" />
                </span>
                <div className="about-teacher-proof__education-content">
                  <div className="about-teacher-proof__education-head">
                    <strong>{item.title}</strong>
                    <span>{item.years}</span>
                  </div>
                  <p>{item.subtitle}</p>
                  <small>{item.description}</small>
                </div>
              </article>
            );
          })}
        </div>

        <div className="about-teacher-proof__diplomas">
          {diplomas.length > 0 ? (
            <div className="about-teacher-proof__diploma-layout">
              <div className="about-teacher-proof__diploma-top">
                {primaryMetric ? (
                  <article className="about-teacher-proof__metric" role="listitem">
                    <span className="about-teacher-proof__metric-value">{primaryMetric.value}</span>
                    <h4>{primaryMetric.label}</h4>
                    <p>{primaryMetric.note}</p>
                  </article>
                ) : null}

                {primaryDiploma ? (
                  <AssetImage
                    key={primaryDiploma.key}
                    src={primaryDiploma.url}
                    alt="Диплом 1"
                    ratio="5 / 3"
                    className="about-teacher-proof__diploma about-teacher-proof__diploma--primary"
                    onClick={() => onOpenDiploma(0)}
                  />
                ) : null}
              </div>

              {secondaryDiplomas.length > 0 ? (
                <div className="about-teacher-proof__diploma-bottom">
                  {secondaryDiplomas.map((diploma, index) => (
                    <AssetImage
                      key={diploma.key}
                      src={diploma.url}
                      alt={`Диплом ${index + 2}`}
                      ratio="4 / 3"
                      className="about-teacher-proof__diploma about-teacher-proof__diploma--secondary"
                      onClick={() => onOpenDiploma(index + 1)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="about-teacher-proof__diploma-empty">
              Дипломы появятся здесь после загрузки материалов.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
