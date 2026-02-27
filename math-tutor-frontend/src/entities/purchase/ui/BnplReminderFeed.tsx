import { Button } from "@mui/material";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import type { PurchaseFinancialStatus } from "../model/policy";

export type BnplReminderEntry = {
  purchaseId: string;
  courseTitle: string;
  financialStatus: PurchaseFinancialStatus;
  nextPaymentDate: string | null;
  overdueDays: number;
};

type Props = {
  items: BnplReminderEntry[];
  onOpenPurchase: (purchaseId: string) => void;
};

const getTitle = (item: BnplReminderEntry) => {
  if (item.financialStatus === "upcoming") return "Скоро платеж";
  if (item.financialStatus === "grace") return "Льготный период";
  if (item.financialStatus === "restricted") return "Ограничен новый контент";
  if (item.financialStatus === "suspended") return "Доступ приостановлен";
  return "Состояние оплаты";
};

const getDescription = (item: BnplReminderEntry) => {
  if (item.financialStatus === "upcoming" && item.nextPaymentDate) {
    return `Следующий платеж по курсу «${item.courseTitle}» запланирован на ${new Date(
      item.nextPaymentDate
    ).toLocaleDateString("ru-RU")}.`;
  }
  if (item.financialStatus === "grace") {
    return `По курсу «${item.courseTitle}» есть просрочка ${item.overdueDays} дн. Доступ пока сохранен.`;
  }
  if (item.financialStatus === "restricted") {
    return `По курсу «${item.courseTitle}» открыты только ранее просмотренные уроки.`;
  }
  if (item.financialStatus === "suspended") {
    return `По курсу «${item.courseTitle}» доступ временно приостановлен до оплаты.`;
  }
  return `Проверьте состояние оплаты по курсу «${item.courseTitle}».`;
};

const getClassName = (status: PurchaseFinancialStatus) => {
  if (status === "suspended") return "is-danger";
  if (status === "restricted") return "is-warning";
  if (status === "grace") return "is-warning";
  return "is-info";
};

export function BnplReminderFeed({
  items,
  onOpenPurchase,
}: Props) {
  if (items.length === 0) return null;

  return (
    <section className="bnpl-reminder-feed">
      <header className="bnpl-reminder-feed__head">
        <h2>
          <NotificationsActiveRoundedIcon fontSize="small" />
          Лента платежных напоминаний
        </h2>
        <span>Актуальный статус оплаты по курсам со сплитом</span>
      </header>
      <div className="bnpl-reminder-feed__list">
        {items.map((item) => (
          <article
            key={item.purchaseId}
            className={`bnpl-reminder-feed__item ${getClassName(item.financialStatus)}`}
          >
            <div className="bnpl-reminder-feed__copy">
              <strong>{getTitle(item)}</strong>
              <p>{getDescription(item)}</p>
            </div>
            <div className="bnpl-reminder-feed__actions">
              <Button
                variant="contained"
                endIcon={<ArrowForwardRoundedIcon />}
                onClick={() => onOpenPurchase(item.purchaseId)}
              >
                Перейти к оплате
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
