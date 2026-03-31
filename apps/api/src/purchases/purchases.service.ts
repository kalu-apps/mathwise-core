import crypto from "node:crypto";
import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { AuthRepository } from "../auth/auth.repository";
import { CoursesRepository } from "../courses/courses.repository";
import { LessonsRepository } from "../lessons/lessons.repository";
import { RedisService } from "../redis/redis.service";
import { PurchasesRepository } from "./purchases.repository";
import {
  type BnplInstallmentPaymentResponseDto,
  type CancelCheckoutResponseDto,
  type CheckoutActionResponseDto,
  type CheckoutListItemDto,
  type CheckoutPayloadDto,
  type CheckoutPaymentDto,
  type CheckoutProcessDto,
  type CheckoutPurchaseResponseDto,
  type CheckoutStateDto,
  type CheckoutStatusResponseDto,
  type CheckoutTimelineResponseDto,
  type CheckoutMethodDto,
  type PurchaseRecordDto,
  isTerminalCheckoutState,
} from "./purchases.types";

const CHECKOUT_TTL_MS = 30 * 60 * 1000;
const IDEMPOTENCY_TTL_SEC = 12 * 60 * 60;
const LOCK_TTL_SEC = 15;

const nowIso = () => new Date().toISOString();

const ensureId = (prefix: string) => {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const lockToken = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeEmail = (value: string | undefined | null) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeCheckoutMethod = (value: unknown): CheckoutMethodDto => {
  if (value === "mock" || value === "card" || value === "sbp" || value === "bnpl") {
    return value;
  }
  return "card";
};

const normalizeInstallmentsCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(2, Math.min(12, Math.floor(parsed)));
};

const toPositiveAmount = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.max(0, Math.round(fallback));
  return Math.max(0, Math.round(parsed));
};

const buildCheckoutExpiresAt = (baseIso: string) =>
  new Date(Date.parse(baseIso) + CHECKOUT_TTL_MS).toISOString();

const parseBnplPlan = (bnpl: unknown, purchasedAt: string) => {
  const source = bnpl && typeof bnpl === "object" ? (bnpl as Record<string, unknown>) : null;
  const plan =
    source?.plan && typeof source.plan === "object"
      ? (source.plan as Record<string, unknown>)
      : source;

  const installmentsCount = normalizeInstallmentsCount(plan?.installmentsCount);
  const paidCountRaw = Number(plan?.paidCount ?? source?.paidCount ?? 0);
  const paidCount = Number.isFinite(paidCountRaw)
    ? Math.max(0, Math.min(installmentsCount, Math.floor(paidCountRaw)))
    : 0;

  const schedule: Array<{ dueDate: string; amount: number; status: "paid" | "due" | "overdue" | "failed" }> = [];
  const providedSchedule = Array.isArray(plan?.schedule)
    ? (plan.schedule as Array<Record<string, unknown>>)
    : Array.isArray(source?.schedule)
      ? (source?.schedule as Array<Record<string, unknown>>)
      : [];

  for (let index = 0; index < installmentsCount; index += 1) {
    const fallbackDate = new Date(Date.parse(purchasedAt) + 14 * 24 * 60 * 60 * 1000 * index)
      .toISOString();
    const candidate = providedSchedule[index];
    const dueDate =
      typeof candidate?.dueDate === "string" && candidate.dueDate.trim()
        ? candidate.dueDate
        : fallbackDate;
    const amountRaw = Number(candidate?.amount ?? 0);
    const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.round(amountRaw)) : 0;
    const statusRaw = candidate?.status;
    const status =
      statusRaw === "paid" ||
      statusRaw === "due" ||
      statusRaw === "overdue" ||
      statusRaw === "failed"
        ? statusRaw
        : index < paidCount
          ? "paid"
          : "due";
    schedule.push({ dueDate, amount, status });
  }

  return {
    provider:
      source?.provider === "dolyami" || source?.provider === "podeli" || source?.provider === "other"
        ? source.provider
        : "unknown",
    installmentsCount,
    paidCount,
    schedule,
  };
};

@Injectable()
export class PurchasesService implements OnModuleInit {
  constructor(
    private readonly purchasesRepository: PurchasesRepository,
    private readonly coursesRepository: CoursesRepository,
    private readonly lessonsRepository: LessonsRepository,
    private readonly authRepository: AuthRepository,
    private readonly redisService: RedisService
  ) {}

  async onModuleInit() {
    await this.purchasesRepository.ensureSchema();
  }

  async getPurchases(params?: { userId?: string }): Promise<PurchaseRecordDto[]> {
    return this.purchasesRepository.findPurchases(params);
  }

  async savePurchases(
    purchases: PurchaseRecordDto[],
    actorUser: AuthUserDto | null
  ): Promise<void> {
    if (!Array.isArray(purchases) || purchases.length === 0) return;
    const userId = purchases[0]?.userId?.trim();
    if (!userId) {
      throw new HttpException({ error: "Некорректный payload purchases." }, 400);
    }
    if (actorUser && actorUser.role !== "teacher" && actorUser.id !== userId) {
      throw new HttpException({ error: "Недостаточно прав для операции." }, 403);
    }
    if (!purchases.every((item) => item.userId === userId)) {
      throw new HttpException({ error: "Все покупки должны принадлежать одному пользователю." }, 400);
    }
    await this.purchasesRepository.replacePurchasesForUser(userId, purchases);
  }

  async deletePurchasesByCourse(
    courseId: string,
    actorUser: AuthUserDto | null
  ): Promise<void> {
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Операция доступна только преподавателю." }, 403);
    }
    const normalizedCourseId = courseId.trim();
    if (!normalizedCourseId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }
    await this.purchasesRepository.deletePurchasesByCourse(normalizedCourseId);
  }

  async checkoutPurchase(params: {
    payload: CheckoutPayloadDto;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<CheckoutPurchaseResponseDto> {
    const { payload, actorUser } = params;
    const method = normalizeCheckoutMethod(payload.paymentMethod);
    if (actorUser?.role === "teacher") {
      throw new HttpException({ error: "Преподаватель не может покупать собственный курс." }, 403);
    }

    const courseId = payload.courseId?.trim();
    if (!courseId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }

    const course = await this.coursesRepository.findById(courseId);
    if (!course) {
      throw new HttpException({ error: "Курс не найден." }, 404);
    }

    const email = normalizeEmail(actorUser?.email ?? payload.email);
    if (!email) {
      throw new HttpException({ error: "Email обязателен для оформления checkout." }, 400);
    }

    if (!actorUser && payload.userId) {
      throw new HttpException({ error: "Авторизуйтесь для checkout c userId." }, 401);
    }

    if (actorUser && payload.userId && payload.userId !== actorUser.id) {
      throw new HttpException({ error: "Недопустимый контекст checkout." }, 403);
    }

    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.purchasesRepository.findIdempotentResponse<CheckoutPurchaseResponseDto>(
        "purchase:checkout:create",
        normalizedIdempotency
      );
      if (cached) return cached;
    }

    const amount = toPositiveAmount(payload.price, course.priceSelf);
    if (amount <= 0) {
      throw new HttpException({ error: "Сумма checkout должна быть больше нуля." }, 400);
    }

    const lockKey = `lock:purchase:checkout:create:${actorUser?.id ?? email}:${courseId}`;
    const response = await this.withLock(lockKey, async () => {
      const existingActive = await this.purchasesRepository.findLatestActiveCheckout({
        userId: actorUser?.id,
        email,
        courseId,
      });
      if (existingActive) {
        const effectiveExisting =
          existingActive.state === "paid" || existingActive.state === "provisioning"
            ? await this.ensureCheckoutProvisioned(existingActive)
            : existingActive;
        const access = await this.buildAccessPayload(effectiveExisting);
        return {
          user: actorUser ?? undefined,
          checkoutId: effectiveExisting.id,
          checkoutState: effectiveExisting.state,
          payment: this.buildPaymentPayload(effectiveExisting),
          identityState: access?.identityState ?? "unverified",
          entitlementState: access?.entitlementState ?? "none",
          profileComplete: access?.profileComplete ?? false,
          accessState: access?.accessState ?? "awaiting_profile",
        } satisfies CheckoutPurchaseResponseDto;
      }

      const createdAt = nowIso();
      const checkout: CheckoutProcessDto = {
        id: ensureId("checkout"),
        userId: actorUser?.id,
        email,
        courseId,
        method,
        bnplInstallmentsCount:
          method === "bnpl"
            ? normalizeInstallmentsCount(payload.bnplInstallmentsCount)
            : undefined,
        amount,
        currency: "RUB",
        state: method === "card" || method === "sbp" ? "awaiting_payment" : "paid",
        createdAt,
        updatedAt: createdAt,
        expiresAt: buildCheckoutExpiresAt(createdAt),
      };

      await this.purchasesRepository.insertCheckout(checkout);
      await this.appendTimelineEvent(
        checkout.id,
        "checkout_created",
        {
          method: checkout.method,
          amount: checkout.amount,
          state: checkout.state,
        },
        createdAt
      );

      const effectiveCheckout =
        checkout.state === "paid" ? await this.ensureCheckoutProvisioned(checkout) : checkout;
      const access = await this.buildAccessPayload(effectiveCheckout);
      return {
        user: actorUser ?? undefined,
        checkoutId: effectiveCheckout.id,
        checkoutState: effectiveCheckout.state,
        payment: this.buildPaymentPayload(effectiveCheckout),
        identityState: access?.identityState ?? "unverified",
        entitlementState: access?.entitlementState ?? "none",
        profileComplete: access?.profileComplete ?? false,
        accessState: access?.accessState ?? "awaiting_profile",
      } satisfies CheckoutPurchaseResponseDto;
    });

    if (normalizedIdempotency) {
      await this.purchasesRepository.saveIdempotentResponse(
        "purchase:checkout:create",
        normalizedIdempotency,
        response,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return response;
  }

  async attachCheckout(params: {
    checkoutId: string;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<CheckoutPurchaseResponseDto> {
    const { actorUser } = params;
    if (!actorUser) {
      throw new HttpException({ error: "Авторизуйтесь для привязки checkout." }, 401);
    }
    if (actorUser.role !== "student") {
      throw new HttpException({ error: "Привязка checkout доступна только ученику." }, 403);
    }

    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.purchasesRepository.findIdempotentResponse<CheckoutPurchaseResponseDto>(
        "purchase:checkout:attach",
        normalizedIdempotency
      );
      if (cached) return cached;
    }

    const lockKey = `lock:purchase:checkout:attach:${params.checkoutId}`;
    const response = await this.withLock(lockKey, async () => {
      const checkout = await this.requireCheckoutForActor(params.checkoutId, actorUser, {
        allowEmailMatchWithoutUserId: true,
      });

      let effectiveCheckout = checkout;
      if (!checkout.userId) {
        effectiveCheckout = {
          ...checkout,
          userId: actorUser.id,
          email: actorUser.email,
          updatedAt: nowIso(),
        };
        await this.purchasesRepository.updateCheckout(effectiveCheckout);
        await this.appendTimelineEvent(
          effectiveCheckout.id,
          "checkout_attached",
          {
            userId: actorUser.id,
          },
          effectiveCheckout.updatedAt
        );
      }

      if (effectiveCheckout.state === "paid" || effectiveCheckout.state === "provisioning") {
        effectiveCheckout = await this.ensureCheckoutProvisioned(effectiveCheckout);
      }

      const access = await this.buildAccessPayload(effectiveCheckout);
      return {
        user: actorUser,
        checkoutId: effectiveCheckout.id,
        checkoutState: effectiveCheckout.state,
        payment: this.buildPaymentPayload(effectiveCheckout),
        identityState: access?.identityState ?? "unverified",
        entitlementState: access?.entitlementState ?? "none",
        profileComplete: access?.profileComplete ?? false,
        accessState: access?.accessState ?? "awaiting_profile",
      } satisfies CheckoutPurchaseResponseDto;
    });

    if (normalizedIdempotency) {
      await this.purchasesRepository.saveIdempotentResponse(
        "purchase:checkout:attach",
        normalizedIdempotency,
        response,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return response;
  }

  async getCheckouts(params: {
    actorUser: AuthUserDto | null;
    userId?: string;
    email?: string;
    courseId?: string;
  }): Promise<CheckoutListItemDto[]> {
    const { actorUser } = params;
    const filters: { userId?: string; email?: string; courseId?: string } = {
      courseId: params.courseId?.trim() || undefined,
    };

    if (actorUser?.role === "teacher") {
      filters.userId = params.userId?.trim() || undefined;
      filters.email = normalizeEmail(params.email) || undefined;
      return this.purchasesRepository.listCheckouts(filters);
    }

    if (!actorUser) {
      return [];
    }

    filters.userId = actorUser.id;
    filters.email = actorUser.email;
    return this.purchasesRepository.listCheckouts(filters);
  }

  async getCheckoutStatus(params: {
    checkoutId: string;
    actorUser: AuthUserDto | null;
  }): Promise<CheckoutStatusResponseDto> {
    const checkout = await this.requireCheckoutForActor(params.checkoutId, params.actorUser, {
      allowEmailMatchWithoutUserId: true,
    });

    const effectiveCheckout =
      checkout.state === "paid" || checkout.state === "provisioning"
        ? await this.ensureCheckoutProvisioned(checkout)
        : checkout;

    return this.buildCheckoutStatusResponse(effectiveCheckout);
  }

  async retryCheckout(params: {
    checkoutId: string;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<CheckoutActionResponseDto> {
    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.purchasesRepository.findIdempotentResponse<CheckoutActionResponseDto>(
        "purchase:checkout:retry",
        normalizedIdempotency
      );
      if (cached) return cached;
    }

    const lockKey = `lock:purchase:checkout:retry:${params.checkoutId}`;
    const response = await this.withLock(lockKey, async () => {
      const checkout = await this.requireCheckoutForActor(params.checkoutId, params.actorUser, {
        allowEmailMatchWithoutUserId: true,
      });

      if (
        checkout.state === "paid" ||
        checkout.state === "provisioning" ||
        checkout.state === "provisioned"
      ) {
        throw new HttpException({ error: "Checkout уже подтвержден и не требует повтора." }, 409);
      }

      const updatedAt = nowIso();
      const retried: CheckoutProcessDto = {
        ...checkout,
        state:
          checkout.method === "card" || checkout.method === "sbp"
            ? "awaiting_payment"
            : "paid",
        updatedAt,
        expiresAt: buildCheckoutExpiresAt(updatedAt),
      };
      await this.purchasesRepository.updateCheckout(retried);
      await this.appendTimelineEvent(
        retried.id,
        "checkout_retry",
        {
          state: retried.state,
          method: retried.method,
        },
        updatedAt
      );

      const effectiveCheckout =
        retried.state === "paid" ? await this.ensureCheckoutProvisioned(retried) : retried;

      return {
        ok: true,
        checkoutId: effectiveCheckout.id,
        checkoutState: effectiveCheckout.state,
        payment: this.buildPaymentPayload(effectiveCheckout),
        access: await this.buildAccessPayload(effectiveCheckout),
      } satisfies CheckoutActionResponseDto;
    });

    if (normalizedIdempotency) {
      await this.purchasesRepository.saveIdempotentResponse(
        "purchase:checkout:retry",
        normalizedIdempotency,
        response,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return response;
  }

  async cancelCheckout(params: {
    checkoutId: string;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<CancelCheckoutResponseDto> {
    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.purchasesRepository.findIdempotentResponse<CancelCheckoutResponseDto>(
        "purchase:checkout:cancel",
        normalizedIdempotency
      );
      if (cached) return cached;
    }

    const lockKey = `lock:purchase:checkout:cancel:${params.checkoutId}`;
    const response = await this.withLock(lockKey, async () => {
      const checkout = await this.requireCheckoutForActor(params.checkoutId, params.actorUser, {
        allowEmailMatchWithoutUserId: true,
      });

      if (
        checkout.state === "paid" ||
        checkout.state === "provisioning" ||
        checkout.state === "provisioned"
      ) {
        throw new HttpException(
          { error: "Оплаченный checkout нельзя отменить через этот сценарий." },
          409
        );
      }

      if (
        checkout.state === "failed" ||
        checkout.state === "canceled" ||
        checkout.state === "expired"
      ) {
        return {
          ok: true,
          idempotent: true,
          checkout: {
            id: checkout.id,
            state: checkout.state,
          },
        } satisfies CancelCheckoutResponseDto;
      }

      const canceled: CheckoutProcessDto = {
        ...checkout,
        state: "canceled",
        updatedAt: nowIso(),
      };
      await this.purchasesRepository.updateCheckout(canceled);
      await this.appendTimelineEvent(
        canceled.id,
        "checkout_canceled",
        {
          reason: "api_cancel",
        },
        canceled.updatedAt
      );

      return {
        ok: true,
        checkout: {
          id: canceled.id,
          state: canceled.state,
        },
      } satisfies CancelCheckoutResponseDto;
    });

    if (normalizedIdempotency) {
      await this.purchasesRepository.saveIdempotentResponse(
        "purchase:checkout:cancel",
        normalizedIdempotency,
        response,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return response;
  }

  async confirmCheckoutPaid(params: {
    checkoutId: string;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<CheckoutActionResponseDto> {
    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.purchasesRepository.findIdempotentResponse<CheckoutActionResponseDto>(
        "purchase:checkout:confirm",
        normalizedIdempotency
      );
      if (cached) return cached;
    }

    const lockKey = `lock:purchase:checkout:confirm:${params.checkoutId}`;
    const response = await this.withLock(lockKey, async () => {
      const checkout = await this.requireCheckoutForActor(params.checkoutId, params.actorUser, {
        allowEmailMatchWithoutUserId: true,
      });

      if (
        checkout.state === "failed" ||
        checkout.state === "canceled" ||
        checkout.state === "expired"
      ) {
        throw new HttpException(
          { error: "Checkout находится в финальном отрицательном состоянии." },
          409
        );
      }

      const markedPaid: CheckoutProcessDto =
        checkout.state === "paid" ||
        checkout.state === "provisioning" ||
        checkout.state === "provisioned"
          ? checkout
          : {
              ...checkout,
              state: "paid",
              updatedAt: nowIso(),
            };

      if (markedPaid !== checkout) {
        await this.purchasesRepository.updateCheckout(markedPaid);
        await this.appendTimelineEvent(
          markedPaid.id,
          "checkout_marked_paid",
          {
            source: "api_confirm_paid",
          },
          markedPaid.updatedAt
        );
      }

      const effectiveCheckout = await this.ensureCheckoutProvisioned(markedPaid);

      return {
        ok: true,
        checkoutId: effectiveCheckout.id,
        checkoutState: effectiveCheckout.state,
        payment: this.buildPaymentPayload(effectiveCheckout),
        access: await this.buildAccessPayload(effectiveCheckout),
      } satisfies CheckoutActionResponseDto;
    });

    if (normalizedIdempotency) {
      await this.purchasesRepository.saveIdempotentResponse(
        "purchase:checkout:confirm",
        normalizedIdempotency,
        response,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return response;
  }

  async getCheckoutTimeline(params: {
    checkoutId: string;
    actorUser: AuthUserDto | null;
  }): Promise<CheckoutTimelineResponseDto> {
    const checkout = await this.requireCheckoutForActor(params.checkoutId, params.actorUser, {
      allowEmailMatchWithoutUserId: true,
    });

    const timeline = await this.purchasesRepository.listCheckoutTimelineEvents(checkout.id);
    return {
      checkoutId: checkout.id,
      state: checkout.state,
      timeline: timeline.map((item) => ({
        at: item.createdAt,
        type: item.type,
        details:
          item.details && typeof item.details === "object"
            ? (item.details as Record<string, unknown>)
            : {},
      })),
    };
  }

  async payBnplInstallment(params: {
    purchaseId: string;
    actorUser: AuthUserDto | null;
    source?: string;
  }): Promise<BnplInstallmentPaymentResponseDto> {
    return this.payBnpl({ ...params, mode: "installment" });
  }

  async payBnplRemaining(params: {
    purchaseId: string;
    actorUser: AuthUserDto | null;
    source?: string;
  }): Promise<BnplInstallmentPaymentResponseDto> {
    return this.payBnpl({ ...params, mode: "remaining" });
  }

  private async payBnpl(params: {
    purchaseId: string;
    actorUser: AuthUserDto | null;
    source?: string;
    mode: "installment" | "remaining";
  }): Promise<BnplInstallmentPaymentResponseDto> {
    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    const purchaseId = params.purchaseId.trim();
    if (!purchaseId) {
      throw new HttpException({ error: "purchaseId обязателен." }, 400);
    }

    const lockKey = `lock:purchase:bnpl:${purchaseId}`;
    return this.withLock(lockKey, async () => {
      const purchase = await this.purchasesRepository.findPurchaseById(purchaseId);
      if (!purchase) {
        throw new HttpException({ error: "Покупка не найдена." }, 404);
      }

      if (actorUser.role !== "teacher" && purchase.userId !== actorUser.id) {
        throw new HttpException({ error: "Недопустимый контекст покупки." }, 403);
      }

      const plan = parseBnplPlan(purchase.bnpl, purchase.purchasedAt);
      const nextPaidCount =
        params.mode === "remaining"
          ? plan.installmentsCount
          : Math.min(plan.installmentsCount, plan.paidCount + 1);
      const perInstallment = Math.max(0, Math.round(purchase.price / plan.installmentsCount));

      const schedule = plan.schedule.map((item, index) => {
        const paid = index < nextPaidCount;
        return {
          dueDate: item.dueDate,
          amount: item.amount > 0 ? item.amount : perInstallment,
          status: paid ? "paid" : "due",
        } as const;
      });

      const nextPaymentDate = schedule.find((item) => item.status !== "paid")?.dueDate;
      const completed = nextPaidCount >= plan.installmentsCount;
      const updatedBnpl = {
        provider: plan.provider,
        plan: {
          installmentsCount: plan.installmentsCount,
          paidCount: nextPaidCount,
          nextPaymentDate,
          schedule,
        },
        installmentsCount: plan.installmentsCount,
        paidCount: nextPaidCount,
        nextPaymentDate,
        schedule,
        lastKnownStatus: completed ? "completed" : "active",
      };

      const updatedPurchase: PurchaseRecordDto = {
        ...purchase,
        paymentMethod: "bnpl",
        bnpl: updatedBnpl,
      };
      await this.purchasesRepository.upsertPurchase(updatedPurchase);

      const checkout = purchase.checkoutId
        ? await this.purchasesRepository.findCheckoutById(purchase.checkoutId)
        : null;
      const payment = checkout
        ? this.buildPaymentPayload(checkout)
        : ({
            provider: "bnpl",
            status: completed ? "paid" : "awaiting_payment",
            outcome: "applied",
            requiresConfirmation: false,
            lastProcessedAt: nowIso(),
          } satisfies CheckoutPaymentDto);

      return {
        ok: true,
        purchaseId: updatedPurchase.id,
        checkoutId: checkout?.id ?? purchase.checkoutId ?? ensureId("checkout"),
        checkoutState: checkout?.state ?? "provisioned",
        payment,
        bnpl: {
          applied: true,
          installmentsCount: plan.installmentsCount,
          paidCount: nextPaidCount,
          nextPaymentDate,
          completed,
        },
        purchase: updatedPurchase,
      };
    });
  }

  private async requireCheckoutForActor(
    checkoutId: string,
    actorUser: AuthUserDto | null,
    options?: { allowEmailMatchWithoutUserId?: boolean }
  ): Promise<CheckoutProcessDto> {
    const normalizedCheckoutId = checkoutId.trim();
    if (!normalizedCheckoutId) {
      throw new HttpException({ error: "checkoutId обязателен." }, 400);
    }
    const checkout = await this.purchasesRepository.findCheckoutById(normalizedCheckoutId);
    if (!checkout) {
      throw new HttpException({ error: "Checkout не найден." }, 404);
    }

    if (actorUser?.role === "teacher") {
      return checkout;
    }

    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    if (checkout.userId && checkout.userId === actorUser.id) {
      return checkout;
    }

    if (
      options?.allowEmailMatchWithoutUserId &&
      !checkout.userId &&
      normalizeEmail(checkout.email) === normalizeEmail(actorUser.email)
    ) {
      return checkout;
    }

    throw new HttpException({ error: "Недопустимый checkout." }, 403);
  }

  private async ensureCheckoutProvisioned(checkout: CheckoutProcessDto): Promise<CheckoutProcessDto> {
    const userId = checkout.userId;
    if (!userId) return checkout;

    let working = checkout;
    if (working.state === "paid") {
      working = {
        ...working,
        state: "provisioning",
        updatedAt: nowIso(),
      };
      await this.purchasesRepository.updateCheckout(working);
      await this.appendTimelineEvent(working.id, "checkout_provisioning", {}, working.updatedAt);
    }

    if (working.state !== "provisioning" && working.state !== "provisioned") {
      return working;
    }

    const course = await this.coursesRepository.findById(working.courseId);
    if (!course) {
      return working;
    }

    const lessons = await this.lessonsRepository.findAll(working.courseId);
    const existing = await this.purchasesRepository.findPurchaseByUserAndCourse(
      userId,
      working.courseId
    );
    const purchasedAt = nowIso();
    const purchase: PurchaseRecordDto = {
      id: existing?.id ?? ensureId("purchase"),
      userId,
      courseId: working.courseId,
      price: working.amount,
      purchasedAt,
      paymentMethod: working.method,
      checkoutId: working.id,
      bnpl:
        working.method === "bnpl"
          ? {
              provider: "unknown",
              plan: {
                installmentsCount: normalizeInstallmentsCount(working.bnplInstallmentsCount),
                paidCount: 1,
                nextPaymentDate: new Date(Date.parse(purchasedAt) + 14 * 24 * 60 * 60 * 1000).toISOString(),
                schedule: Array.from(
                  { length: normalizeInstallmentsCount(working.bnplInstallmentsCount) },
                  (_, index) => ({
                    dueDate: new Date(
                      Date.parse(purchasedAt) + index * 14 * 24 * 60 * 60 * 1000
                    ).toISOString(),
                    amount: Math.max(
                      0,
                      Math.ceil(working.amount / normalizeInstallmentsCount(working.bnplInstallmentsCount))
                    ),
                    status: index === 0 ? "paid" : "due",
                  })
                ),
              },
              installmentsCount: normalizeInstallmentsCount(working.bnplInstallmentsCount),
              paidCount: 1,
              lastKnownStatus: "active",
            }
          : existing?.bnpl,
      courseSnapshot: course,
      lessonsSnapshot: lessons,
      purchasedTestItemIds: existing?.purchasedTestItemIds,
    };

    const authUser = await this.authRepository.findById(userId);
    const accessContext = {
      userId,
      email: authUser?.email ?? working.email,
      role: authUser?.role ?? "student",
      isIdentityVerified: true,
      courseId: working.courseId,
      hasActiveEntitlement: true,
    } as const;

    const nextCheckout: CheckoutProcessDto =
      working.state === "provisioned"
        ? working
        : {
            ...working,
            state: "provisioned" as const,
            updatedAt: nowIso(),
          };

    await this.purchasesRepository.provisionCheckoutAtomic({
      checkout: nextCheckout,
      purchase,
      accessContext,
    });

    if (nextCheckout !== working) {
      await this.appendTimelineEvent(nextCheckout.id, "checkout_provisioned", {
        purchaseId: purchase.id,
      }, nextCheckout.updatedAt);
    }

    return nextCheckout;
  }

  private buildPaymentPayload(checkout: CheckoutProcessDto): CheckoutPaymentDto {
    const requiresConfirmation =
      checkout.method === "card" && checkout.state === "awaiting_payment";

    const status: CheckoutPaymentDto["status"] =
      checkout.state === "created" || checkout.state === "awaiting_payment"
        ? "awaiting_payment"
        : checkout.state === "failed"
          ? "failed"
          : checkout.state === "canceled"
            ? "canceled"
            : checkout.state === "expired"
              ? "expired"
              : "paid";

    const outcome: CheckoutPaymentDto["outcome"] =
      status === "awaiting_payment"
        ? "awaiting_user_action"
        : status === "paid"
          ? "applied"
          : status === "canceled" || status === "expired"
            ? "canceled"
            : "failed";

    const base: CheckoutPaymentDto = {
      provider: checkout.method,
      status,
      outcome,
      providerPaymentId: `${checkout.method}_pi_${checkout.id.slice(-12)}`,
      requiresConfirmation,
      lastProcessedAt:
        status === "awaiting_payment" ? null : checkout.updatedAt,
    };

    if (checkout.method === "card") {
      return {
        ...base,
        paymentUrl: `https://pay.mock-card.local/checkout/${checkout.id}`,
        redirectUrl: `https://pay.mock-card.local/checkout/${checkout.id}`,
        returnUrl: `/courses/${encodeURIComponent(checkout.courseId)}`,
      };
    }

    if (checkout.method === "sbp") {
      return {
        ...base,
        sbp: {
          qrUrl: `https://qr.mock-sbp.local/${checkout.id}`,
          deepLinkUrl: `bankapp://sbp/pay/${checkout.id}`,
          expiresAt: checkout.expiresAt,
        },
      };
    }

    return base;
  }

  private async buildAccessPayload(
    checkout: CheckoutProcessDto
  ): Promise<CheckoutStatusResponseDto["access"]> {
    if (!checkout.userId) {
      return {
        identityState: "unverified",
        entitlementState: "none",
        profileComplete: false,
        accessState: "awaiting_profile",
      };
    }

    const access = await this.purchasesRepository.getUserAccessContext(
      checkout.userId,
      checkout.courseId
    );

    if (access.role === "teacher") {
      return {
        identityState: "verified",
        entitlementState: "active",
        profileComplete: true,
        accessState: "active",
      };
    }

    if (access.hasActiveEntitlement && access.isIdentityVerified) {
      return {
        identityState: "verified",
        entitlementState: "active",
        profileComplete: true,
        accessState: "active",
      };
    }

    if (!access.isIdentityVerified) {
      return {
        identityState: "unverified",
        entitlementState: access.hasActiveEntitlement ? "active" : "none",
        profileComplete: true,
        accessState: "awaiting_verification",
      };
    }

    return {
      identityState: "verified",
      entitlementState: access.hasActiveEntitlement ? "active" : "none",
      profileComplete: true,
      accessState: "paid_but_restricted",
    };
  }

  private async buildCheckoutStatusResponse(
    checkout: CheckoutProcessDto
  ): Promise<CheckoutStatusResponseDto> {
    const payment = this.buildPaymentPayload(checkout);
    const access = await this.buildAccessPayload(checkout);
    return {
      checkoutId: checkout.id,
      state: checkout.state,
      method: checkout.method,
      bnplInstallmentsCount: checkout.bnplInstallmentsCount,
      amount: checkout.amount,
      currency: checkout.currency,
      createdAt: checkout.createdAt,
      updatedAt: checkout.updatedAt,
      expiresAt: checkout.expiresAt ?? null,
      isTerminal: isTerminalCheckoutState(checkout.state),
      payment,
      access,
    };
  }

  private async appendTimelineEvent(
    checkoutId: string,
    type: string,
    details: Record<string, unknown>,
    at: string
  ) {
    await this.purchasesRepository.addCheckoutTimelineEvent({
      id: ensureId("checkout_evt"),
      checkoutId,
      type,
      details,
      createdAt: at,
    });
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const token = lockToken();
    const acquired = await this.redisService.setIfAbsent(key, token, LOCK_TTL_SEC);
    if (!acquired) {
      throw new HttpException(
        {
          error: "Похожий checkout-запрос уже обрабатывается. Повторите через несколько секунд.",
          code: "request_in_progress",
        },
        409
      );
    }
    try {
      return await operation();
    } finally {
      await this.redisService.releaseLock(key, token);
    }
  }
}
