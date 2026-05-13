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
  if (status === "created") return "Ожидает оплаты";
  if (status === "pending_provider") return "Ожидает оплаты";
  if (status === "provider_confirmed") return "Оплачен";
  if (status === "paid") return "Оплачен";
  if (status === "failed") return "Оплата не завершена";
  if (status === "canceled") return "Оплата не завершена";
  if (status === "expired") return "Ссылка устарела";
  if (status === "provision_pending") return "Активируем доступ";
  if (status === "provision_failed_retryable") return "Проверяем доступ";
  if (status === "provisioned") return "Доступ активирован";
  if (status === "email_verification_pending") return "Ожидается подтверждение email";
  return "Проверяем оплату";
};

export const getCheckoutDialogTitle = (status?: string) => {
  if (status === "paid") return "Оплата принята";
  if (status === "provider_confirmed") return "Оплата подтверждена";
  if (status === "failed") return "Оплата не завершена";
  if (status === "canceled") return "Оплата не завершена";
  if (status === "expired") return "Ссылка на оплату устарела";
  if (status === "provision_pending") return "Активируем доступ к курсу";
  if (status === "provisioned") return "Доступ к курсу активирован";
  if (status === "email_verification_pending") return "Нужно подтвердить email";
  return "Переход к оплате";
};

export const getCheckoutDialogHint = (
  status?: string,
  requiresConfirmation?: boolean
) => {
  if (status === "paid") {
    return "Платеж принят. Доступ к курсу активируется автоматически.";
  }
  if (status === "provider_confirmed") {
    return "Платеж подтвержден. Доступ к материалам курса появится автоматически.";
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
    return "Оплата не была завершена. Деньги не списаны, можно открыть платежную страницу заново.";
  }
  if (requiresConfirmation) {
    return "Если страница оплаты не открылась автоматически, перейдите к оплате еще раз.";
  }
  return "Проверяем оплату. Обычно это занимает несколько секунд.";
};

export const getResumeCheckoutCopy = (status?: string) => {
  if (status === "expired") {
    return {
      title: "Ссылка на оплату устарела",
      body: "Создадим новую ссылку и откроем оплату в отдельной вкладке.",
      action: "Открыть оплату",
    };
  }
  if (status === "failed") {
    return {
      title: "Оплата не завершена",
      body: "Операция не была подтверждена. Можно попробовать снова.",
      action: "Попробовать снова",
    };
  }
  if (status === "canceled") {
    return {
      title: "Оплата не завершена",
      body: "Платежная страница была закрыта до завершения. Деньги не списаны.",
      action: "Продолжить",
    };
  }
  if (status === "provision_failed_retryable") {
    return {
      title: "Доступ обновляется",
      body: "Оплата найдена. Проверим доступ и синхронизируем материалы курса.",
      action: "Проверить",
    };
  }
  return {
    title: "Оплата ожидает завершения",
    body: "Откроем защищенную платежную страницу в новой вкладке.",
    action: "Продолжить",
  };
};

export const getPaymentProviderLabel = (
  method?: string | null,
  fallback?: string
) => {
  if (method === "yookassa") return "YooKassa";
  if (method === "cloudpayments") return "CloudPayments";
  if (method === "tbank") return "Т-Банк";
  return (
    PAYMENT_METHODS.find((item) => item.id === method)?.title ??
    fallback ??
    "Способ оплаты"
  );
};

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

export const isPreviewLessonUnlocked = (params: {
  canAccessPreviewLesson: boolean;
  lessonOrder: number;
}) => params.canAccessPreviewLesson && params.lessonOrder === 1;

export const isCourseLessonLocked = (params: {
  hasDomainAccess: boolean;
  canAccessPreviewLesson: boolean;
  lessonOrder: number;
  isBnplSuspended: boolean;
  isBnplRestricted: boolean;
  wasOpened: boolean;
}) => {
  if (!params.hasDomainAccess) {
    return !isPreviewLessonUnlocked({
      canAccessPreviewLesson: params.canAccessPreviewLesson,
      lessonOrder: params.lessonOrder,
    });
  }
  if (params.isBnplSuspended) return true;
  if (params.isBnplRestricted) return !params.wasOpened;
  return false;
};

export const isCourseTestLockedByAccess = (params: {
  hasDomainAccess: boolean;
  isBnplSuspended: boolean;
}) => {
  if (!params.hasDomainAccess) return true;
  if (params.isBnplSuspended) return true;
  return false;
};

const buildLessonMaterialsSignature = (materials: Lesson["materials"] | undefined) =>
  (materials ?? [])
    .map((item) => ({
      id: item.id,
      name: item.name ?? "",
      type: item.type,
      mediaObjectId: item.mediaObjectId ?? "",
      url: item.url ?? "",
      downloadable:
        typeof item.downloadable === "boolean" ? item.downloadable : true,
    }))
    .sort((a, b) =>
      `${a.id}:${a.name}:${a.type}`.localeCompare(`${b.id}:${b.name}:${b.type}`)
    );

export const hasLessonChangedFromPurchaseSnapshot = (
  currentLesson: Lesson,
  purchasedLesson: Lesson
) => {
  const currentMaterials = buildLessonMaterialsSignature(currentLesson.materials);
  const purchasedMaterials = buildLessonMaterialsSignature(purchasedLesson.materials);
  return (
    currentLesson.title !== purchasedLesson.title ||
    currentLesson.duration !== purchasedLesson.duration ||
    (currentLesson.videoMediaObjectId ?? "") !==
      (purchasedLesson.videoMediaObjectId ?? "") ||
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
