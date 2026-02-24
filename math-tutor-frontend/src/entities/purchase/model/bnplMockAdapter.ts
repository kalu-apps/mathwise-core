import type {
  BnplPlan,
  BnplPlanPreview,
  BnplProvider,
  BnplPurchaseData,
  BnplQuote,
} from "./types";

export type BnplMockMode = "fixed4" | "choice4_6_10" | "unknownUntilCheckout";

const DEFAULT_MODE: BnplMockMode = "choice4_6_10";
const DEFAULT_PROVIDER: BnplProvider = "unknown";
const INSTALLMENT_INTERVAL_DAYS = 14;
const MIN_BNPL_PRICE = 1;

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const addDaysIso = (iso: string, days: number) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const makePreview = (price: number, installmentsCount: number): BnplPlanPreview => ({
  installmentsCount,
  periodLabel: `× ${installmentsCount} платежей`,
  fromAmount: Math.ceil(price / installmentsCount),
  total: price,
});

const normalizeMode = (mode?: unknown): BnplMockMode => {
  if (mode === "fixed4" || mode === "choice4_6_10" || mode === "unknownUntilCheckout") {
    return mode;
  }
  return DEFAULT_MODE;
};

export const resolveBnplMockMode = (mode?: unknown): BnplMockMode =>
  normalizeMode(mode);

export const getBnplMockOffer = (params: {
  price: number;
  provider?: BnplProvider;
  mode?: BnplMockMode;
}) => {
  const mode = normalizeMode(params.mode);
  const price = Math.max(0, params.price);
  const provider = params.provider ?? DEFAULT_PROVIDER;
  const unavailableQuote: BnplQuote = {
    disclaimer:
      "Оплата частями доступна для курсов от минимальной суммы, установленной провайдером.",
  };

  if (price < MIN_BNPL_PRICE) {
    return {
      provider,
      mode,
      isAvailable: false,
      quote: unavailableQuote,
    };
  }

  if (mode === "unknownUntilCheckout") {
    return {
      provider,
      mode,
      isAvailable: true,
      quote: {
        disclaimer:
          "Точный график платежей рассчитывается на этапе checkout провайдером оплаты частями.",
      },
    };
  }

  if (mode === "fixed4") {
    const preview = makePreview(price, 4);
    return {
      provider,
      mode,
      isAvailable: true,
      quote: {
        preview,
        availablePlans: [preview],
        disclaimer:
          "Точный график платежей рассчитывается на этапе checkout провайдером оплаты частями.",
      },
    };
  }

  const availablePlans = [4, 6, 10].map((count) => makePreview(price, count));
  return {
    provider,
    mode,
    isAvailable: true,
    quote: {
      preview: availablePlans[0],
      availablePlans,
      disclaimer:
        "Точный график платежей рассчитывается на этапе checkout провайдером оплаты частями.",
    },
  };
};

const resolveInstallmentsCount = (params: {
  price: number;
  selectedInstallmentsCount?: number;
  mode?: BnplMockMode;
}) => {
  const offer = getBnplMockOffer({
    price: params.price,
    mode: params.mode,
  });
  const available = offer.quote.availablePlans?.map((item) => item.installmentsCount) ?? [];
  const selected = toNumber(params.selectedInstallmentsCount);

  if (selected && available.includes(selected)) return selected;
  if (selected && selected > 0 && available.length === 0) return selected;
  if (available.length > 0) return available[0];
  return 4;
};

export const buildBnplMockPlan = (params: {
  price: number;
  purchasedAt: string;
  mode?: BnplMockMode;
  selectedInstallmentsCount?: number;
  paidCount?: number;
}): BnplPlan => {
  const installmentsCount = resolveInstallmentsCount({
    price: params.price,
    mode: params.mode,
    selectedInstallmentsCount: params.selectedInstallmentsCount,
  });
  const installmentAmount = Math.ceil(Math.max(0, params.price) / installmentsCount);
  const paidCount = Math.max(
    0,
    Math.min(
      installmentsCount,
      toNumber(params.paidCount) ?? Math.min(1, installmentsCount)
    )
  );
  const schedule = Array.from({ length: installmentsCount }, (_, index) => ({
    dueDate: addDaysIso(params.purchasedAt, INSTALLMENT_INTERVAL_DAYS * index),
    amount: installmentAmount,
    status: index < paidCount ? ("paid" as const) : ("due" as const),
  }));

  return {
    installmentsCount,
    paidCount,
    nextPaymentDate: schedule.find((item) => item.status !== "paid")?.dueDate,
    schedule,
  };
};

export const buildBnplMockPurchaseData = (params: {
  price: number;
  purchasedAt: string;
  provider?: BnplProvider;
  mode?: BnplMockMode;
  selectedInstallmentsCount?: number;
  paidCount?: number;
}): BnplPurchaseData => {
  const provider = params.provider ?? DEFAULT_PROVIDER;
  const mode = normalizeMode(params.mode);
  const offer = getBnplMockOffer({
    price: params.price,
    provider,
    mode,
  });
  const plan =
    mode === "unknownUntilCheckout"
      ? undefined
      : buildBnplMockPlan({
          price: params.price,
          purchasedAt: params.purchasedAt,
          mode,
          selectedInstallmentsCount: params.selectedInstallmentsCount,
          paidCount: params.paidCount,
        });

  return {
    provider,
    offer: offer.quote,
    plan,
    lastKnownStatus: "active",
    // legacy compatibility fields
    installmentsCount: plan?.installmentsCount,
    paidCount: plan?.paidCount,
    nextPaymentDate: plan?.nextPaymentDate,
    schedule: plan?.schedule,
  };
};
