import SchoolIcon from "@mui/icons-material/School";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import { Button } from "@mui/material";
import { Section } from "@/shared/ui/Section";
import { useNavigate } from "react-router-dom";

const benefits = [
  {
    icon: <PlayCircleIcon />,
    title: "Видеокурсы",
    text: "Учись в удобное время",
    buttonText: "Узнать подробнее",
    buttonAction: "/courses",
  },
  {
    icon: <EventAvailableIcon />,
    title: "Индивидуальные занятия",
    text: "Обратная связь 24/7",
    buttonText: "Записаться",
    buttonAction: "/booking",
  },
  {
    icon: <SchoolIcon />,
    title: "Понятно и структурно",
    text: "Сложные темы объясняются просто",
    buttonText: "Задать вопрос",
    buttonAction: "/contact",
  },
];

export function BenefitsSection() {
  const navigate = useNavigate();

  return (
    <Section>
      <div className="section">
        <div className="grid">
          {benefits.map((b) => (
            <div key={b.title} className="card">
              <div className="icon">{b.icon}</div>
              <h3 className="title">{b.title}</h3>
              <p className="text">{b.text}</p>
              <Button
                className="action-button"
                onClick={() => navigate(b.buttonAction)}
                fullWidth
              >
                {b.buttonText}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
