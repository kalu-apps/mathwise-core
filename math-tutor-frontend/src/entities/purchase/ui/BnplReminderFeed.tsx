import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import type { PurchaseFinancialStatus } from "../model/policy";
import { Notice, type NoticeTone } from "@/shared/ui/Notice";

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

const getTone = (status: PurchaseFinancialStatus): NoticeTone => {
  if (status === "suspended") return "critical";
  if (status === "restricted") return "warning";
  if (status === "grace") return "warning";
  return "info";
};

export function BnplReminderFeed({
  items,
  onOpenPurchase,
}: Props) {
  if (items.length === 0) return null;
  const urgentItems = items.filter((item) => item.financialStatus !== "upcoming");
  const visibleItems = urgentItems.length > 0 ? urgentItems : items.slice(0, 1);
  const hasUrgentItems = urgentItems.length > 0;

  return (
    <section className="bnpl-reminder-feed">
      <header className="bnpl-reminder-feed__head">
        <h2>
          <NotificationsActiveRoundedIcon fontSize="small" />
          {hasUrgentItems ? "Требует внимания" : "Платежи"}
        </h2>
        <span>Только актуальные напоминания по оплате частями</span>
      </header>
      <div className="bnpl-reminder-feed__list">
        {visibleItems.map((item) => (
          <Notice
            key={item.purchaseId}
            tone={getTone(item.financialStatus)}
            placement="dashboard"
            density="compact"
            className="bnpl-reminder-feed__item"
            title={getTitle(item)}
            actions={[
              {
                label:
                  item.financialStatus === "upcoming"
                    ? "Детали"
                    : "Открыть оплату",
                onClick: () => onOpenPurchase(item.purchaseId),
                icon: <ArrowForwardRoundedIcon fontSize="small" />,
              },
            ]}
          >
            <p>{getDescription(item)}</p>
          </Notice>
        ))}
      </div>
    </section>
  );
}
