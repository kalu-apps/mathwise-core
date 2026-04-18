import { ABOUT_TEACHER_EDUCATION, ABOUT_TEACHER_METRICS } from "../model/content";
import type { AboutTeacherAsset } from "../model/types";
import { AssetImage } from "./AssetImage";

type AboutTeacherProofProps = {
  diplomas: AboutTeacherAsset[];
  onOpenDiploma: (index: number) => void;
};

export function AboutTeacherProof({ diplomas, onOpenDiploma }: AboutTeacherProofProps) {
  return (
    <section className="about-teacher-proof" aria-labelledby="about-teacher-proof-title">
      <div className="about-teacher-proof__intro">
        <span className="about-teacher-proof__eyebrow">Опыт и квалификация</span>
        <h2 id="about-teacher-proof-title">Опыт, образование и подтверждённые дипломы</h2>
        <p>
          Последовательно готовлю учеников к школе, ОГЭ и ЕГЭ: с понятной системой,
          структурой занятий и контролем прогресса.
        </p>
      </div>

      <div className="about-teacher-proof__metrics" role="list" aria-label="Ключевые показатели">
        {ABOUT_TEACHER_METRICS.map((metric) => (
          <article className="about-teacher-proof__metric" role="listitem" key={metric.label}>
            <span className="about-teacher-proof__metric-value">{metric.value}</span>
            <h3>{metric.label}</h3>
            <p>{metric.note}</p>
          </article>
        ))}
      </div>

      <div className="about-teacher-proof__body">
        <div className="about-teacher-proof__education">
          <h3>Образование</h3>
          <ol>
            {ABOUT_TEACHER_EDUCATION.map((item) => (
              <li key={`${item.title}_${item.years}`}>
                <div className="about-teacher-proof__education-head">
                  <strong>{item.title}</strong>
                  <span>{item.years}</span>
                </div>
                <p>{item.subtitle}</p>
                <small>{item.description}</small>
              </li>
            ))}
          </ol>
        </div>

        <div className="about-teacher-proof__diplomas">
          <h3>Дипломы и подтверждения</h3>
          {diplomas.length > 0 ? (
            <div className="about-teacher-proof__diploma-grid">
              {diplomas.map((diploma, index) => (
                <AssetImage
                  key={diploma.key}
                  src={diploma.url}
                  alt={`Диплом ${index + 1}`}
                  ratio="4 / 3"
                  className="about-teacher-proof__diploma"
                  onClick={() => onOpenDiploma(index)}
                />
              ))}
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
