import type { Lesson } from "@/entities/lesson/model/types";

export type PaymentMethod = "card" | "sbp" | "bnpl";

type PaymentMethodMeta = {
  id: PaymentMethod;
  title: string;
  subtitle: string;
};

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  {
    id: "card",
    title: "Банковская карта",
    subtitle: "Оплата через защищенную форму банка.",
  },
  {
    id: "sbp",
    title: "СБП",
    subtitle: "Быстрый перевод через приложение банка.",
  },
  {
    id: "bnpl",
    title: "Оплата частями",
    subtitle: "Оплата частями по графику провайдера.",
  },
];

export const RESUMABLE_CHECKOUT_STATES = new Set<string>([
  "created",
  "pending_provider",
  "failed",
  "provision_failed_retryable",
  "canceled",
  "expired",
]);

export const getCheckoutStatusLabel = (status?: string) => {
  if (status === "provider_confirmed") return "Оплачен";
  if (status === "failed") return "Ошибка оплаты";
  if (status === "canceled") return "Платеж отменен";
  if (status === "expired") return "Время истекло";
  if (status === "provision_pending") return "Активируем доступ";
  if (status === "provisioned") return "Доступ активирован";
  if (status === "email_verification_pending") return "Ожидается подтверждение email";
  return "Ожидает подтверждения";
};

export const getCheckoutDialogTitle = (status?: string) => {
  if (status === "provider_confirmed") return "Оплата подтверждена";
  if (status === "failed") return "Оплата не прошла";
  if (status === "canceled") return "Платеж отменен";
  if (status === "expired") return "Срок оплаты истек";
  if (status === "provision_pending") return "Активируем доступ к курсу";
  if (status === "provisioned") return "Доступ к курсу активирован";
  if (status === "email_verification_pending") return "Нужно подтвердить email";
  return "Подтверждаем оплату";
};

export const getCheckoutDialogHint = (
  status?: string,
  requiresConfirmation?: boolean
) => {
  if (status === "provider_confirmed") {
    return "Платеж зарегистрирован. Проверяем активацию доступа к материалам курса.";
  }
  if (status === "provision_pending") {
    return "Оплата подтверждена. Активируем доступ к курсу.";
  }
  if (status === "provisioned") {
    return "Оплата подтверждена, доступ к курсу уже активирован.";
  }
  if (status === "email_verification_pending") {
    return "Оплата подтверждена. Для полного доступа подтвердите email.";
  }
  if (status === "failed" || status === "canceled" || status === "expired") {
    return "Платеж не завершен. Повторите попытку или откройте страницу оплаты повторно.";
  }
  if (requiresConfirmation) {
    return "Откройте страницу банка и завершите оплату. Затем обновите статус, чтобы синхронизировать доступ.";
  }
  return "Подтверждаем данные по оплате. Обновите статус через несколько секунд.";
};

export const getPaymentProviderLabel = (
  method?: string | null,
  fallback?: string
) =>
  PAYMENT_METHODS.find((item) => item.id === method)?.title ??
  fallback ??
  "Способ оплаты";

export const formatDateRu = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const getApproxMonthlyFrom = (params: {
  fromAmount: number | null;
  periodLabel?: string;
}) => {
  if (!params.fromAmount || params.fromAmount <= 0) return null;
  const period = (params.periodLabel ?? "").toLowerCase();
  if (period.includes("2 нед")) return params.fromAmount * 2;
  if (period.includes("нед")) return Math.round((params.fromAmount * 52) / 12);
  return params.fromAmount;
};

export const formatApproxMonthlyBnplLine = (params: {
  fromAmount: number | null;
  periodLabel?: string;
}) => {
  const approxMonthly = getApproxMonthlyFrom(params);
  if (!approxMonthly) {
    return "Оплата частями доступна (условия покажем на следующем шаге).";
  }
  return `Оплата частями: от ${approxMonthly.toLocaleString("ru-RU")} ₽ в месяц`;
};

const buildLessonMaterialsSignature = (materials: Lesson["materials"] | undefined) =>
  (materials ?? [])
    .map((item) => ({
      id: item.id,
      name: item.name ?? "",
      type: item.type,
      url: item.url ?? "",
    }))
    .sort((a, b) => `${a.id}:${a.name}:${a.type}`.localeCompare(`${b.id}:${b.name}:${b.type}`));

export const hasLessonChangedFromPurchaseSnapshot = (
  currentLesson: Lesson,
  purchasedLesson: Lesson
) => {
  const currentMaterials = buildLessonMaterialsSignature(currentLesson.materials);
  const purchasedMaterials = buildLessonMaterialsSignature(purchasedLesson.materials);
  return (
    currentLesson.title !== purchasedLesson.title ||
    currentLesson.duration !== purchasedLesson.duration ||
    (currentLesson.videoUrl ?? "") !== (purchasedLesson.videoUrl ?? "") ||
    (currentLesson.videoStreamUrl ?? "") !==
      (purchasedLesson.videoStreamUrl ?? "") ||
    (currentLesson.videoPosterUrl ?? "") !==
      (purchasedLesson.videoPosterUrl ?? "") ||
    JSON.stringify(currentLesson.settings ?? null) !==
      JSON.stringify(purchasedLesson.settings ?? null) ||
    JSON.stringify(currentMaterials) !== JSON.stringify(purchasedMaterials)
  );
};

export const getBnplStatusBanner = (
  financialStatus: string,
  params: {
    nextPaymentDate: string | null;
    overdueDays: number;
  }
) => {
  const nextDate = formatDateRu(params.nextPaymentDate);
  if (financialStatus === "upcoming") {
    return {
      severity: "info" as const,
      text: nextDate
        ? `Напоминание по оплате частями: следующий платеж ${nextDate}.`
        : "Напоминание по оплате частями: скоро следующий платеж.",
    };
  }
  if (financialStatus === "grace") {
    return {
      severity: "warning" as const,
      text: `Платеж по сплиту просрочен. У вас еще полный доступ (${Math.max(
        0,
        3 - params.overdueDays
      )} дн. до ограничения новых уроков).`,
    };
  }
  if (financialStatus === "restricted") {
    return {
      severity: "warning" as const,
      text: "Новые уроки временно заблокированы до погашения просрочки по сплиту.",
    };
  }
  if (financialStatus === "suspended") {
    return {
      severity: "error" as const,
      text: "Доступ к урокам временно приостановлен из-за длительной просрочки по сплиту.",
    };
  }
  return null;
};
