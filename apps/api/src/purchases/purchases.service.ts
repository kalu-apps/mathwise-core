import crypto from "node:crypto";
import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { AuthService } from "../auth/auth.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { CoursesRepository } from "../courses/courses.repository";
import { LessonsRepository } from "../lessons/lessons.repository";
import { NotificationsService } from "../notifications/notifications.service";
import { RedisService } from "../redis/redis.service";
import { PurchasesRepository } from "./purchases.repository";
import {
  IDEMPOTENCY_TTL_SEC,
  LOCK_TTL_SEC,
  buildCheckoutExpiresAt,
  ensureId,
  lockToken,
  normalizeCheckoutMethod,
  normalizeEmail,
  normalizeInstallmentsCount,
  normalizePhone,
  nowIso,
  parseBnplPlan,
  toPositiveAmount,
  validateEmailFormat,
} from "./purchases.helpers";
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
  type ProviderWebhookPayloadDto,
  type PurchaseRecordDto,
  isTerminalCheckoutState,
} from "./purchases.types";

type ProviderWebhookResult = {
  ok: boolean;
  event: {
    status: string;
    outcome: string;
  };
  checkout: {
    id: string;
    state: CheckoutStateDto;
  } | null;
};

const readCourseSnapshotPrice = (course: {
  priceGuided: number;
  priceSelf: number;
}) => Math.max(0, Math.round(Number(course.priceSelf ?? course.priceGuided ?? 0)));

const timingSafeEquals = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

@Injectable()
export class PurchasesService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly purchasesRepository: PurchasesRepository,
    private readonly coursesRepository: CoursesRepository,
    private readonly lessonsRepository: LessonsRepository,
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService
  ) {}

  async onModuleInit() {
    await this.purchasesRepository.ensureSchema();
  }

  async getPurchases(params: {
    actorUser: AuthUserDto | null;
    userId?: string;
  }): Promise<PurchaseRecordDto[]> {
    const { actorUser } = params;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    if (actorUser.role === "teacher") {
      return this.purchasesRepository.findPurchases({
        userId: params.userId?.trim() || undefined,
      });
    }

    return this.purchasesRepository.findPurchases({ userId: actorUser.id });
  }

  async savePurchases(
    purchases: PurchaseRecordDto[],
    actorUser: AuthUserDto | null
  ): Promise<void> {
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Операция доступна только преподавателю." }, 403);
    }

    if (!Array.isArray(purchases) || purchases.length === 0) return;
    const userId = purchases[0]?.userId?.trim();
    if (!userId) {
      throw new HttpException({ error: "Некорректный payload purchases." }, 400);
    }
    if (!purchases.every((item) => item.userId?.trim() === userId)) {
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

    if (actorUser?.role === "teacher") {
      throw new HttpException({ error: "Преподаватель не может покупать курсы." }, 403);
    }

    const method = normalizeCheckoutMethod(payload.paymentMethod);
    const courseId = payload.courseId?.trim();
    if (!courseId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }

    const course = await this.coursesRepository.findById(courseId);
    if (!course) {
      throw new HttpException({ error: "Курс не найден." }, 404);
    }

    const email = normalizeEmail(actorUser?.email || payload.email);
    if (!email || !validateEmailFormat(email)) {
      throw new HttpException({ error: "Некорректный email для checkout." }, 400);
    }

    if (!actorUser && payload.userId) {
      throw new HttpException({ error: "Недопустимый checkout context." }, 401);
    }

    if (actorUser && payload.userId && payload.userId !== actorUser.id) {
      throw new HttpException({ error: "Недопустимый checkout context." }, 403);
    }

    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.purchasesRepository.findIdempotentResponse<CheckoutPurchaseResponseDto>(
        "purchase:checkout:create",
        normalizedIdempotency
      );
      if (cached) return cached;
    }

    const amount = toPositiveAmount(payload.price, readCourseSnapshotPrice(course));
    if (amount <= 0) {
      throw new HttpException({ error: "Сумма checkout должна быть больше нуля." }, 400);
    }

    const acceptedScopes = payload.consents?.acceptedScopes ?? [];
    if (!Array.isArray(acceptedScopes) || acceptedScopes.length === 0) {
      throw new HttpException({ error: "Необходимо принять обязательные согласия." }, 400);
    }

    const lockKey = `lock:purchase:checkout:create:${actorUser?.id ?? email}:${courseId}`;
    const response = await this.withLock(lockKey, async () => {
      const existingActive = await this.purchasesRepository.findLatestActiveCheckout({
        userId: actorUser?.id,
        email,
        courseId,
      });
      if (existingActive) {
        const maybeProvisioned = await this.resumeProvisionIfNeeded(existingActive);
        return this.buildCheckoutPurchaseResponse(maybeProvisioned, actorUser ?? undefined);
      }

      const createdAt = nowIso();
      const checkout: CheckoutProcessDto = {
        id: ensureId("checkout"),
        userId: actorUser?.id,
        email,
        firstName: payload.firstName?.trim() || undefined,
        lastName: payload.lastName?.trim() || undefined,
        phone: normalizePhone(payload.phone),
        courseId,
        method,
        bnplInstallmentsCount:
          method === "bnpl"
            ? normalizeInstallmentsCount(payload.bnplInstallmentsCount)
            : undefined,
        amount,
        currency: "RUB",
        state: "pending_provider",
        consentSnapshot: acceptedScopes,
        createdAt,
        updatedAt: createdAt,
        expiresAt: buildCheckoutExpiresAt(createdAt),
      };

      await this.purchasesRepository.insertCheckout(checkout);
      await this.purchasesRepository.upsertConsentRecords({
        checkoutId: checkout.id,
        email,
        scopes: acceptedScopes,
        acceptedAt: createdAt,
      });
      await this.appendTimelineEvent(checkout.id, "checkout_created", {
        method,
        amount,
        actorUserId: actorUser?.id,
      });

      let effectiveCheckout = checkout;
      if (
        this.runtimeConfig.appEnv === "local" &&
        this.runtimeConfig.paymentProviderAutoConfirmLocal
      ) {
        const simulatedEventId = `sim_${checkout.id}`;
        await this.handleProviderWebhook({
          payload: {
            eventId: simulatedEventId,
            checkoutId: checkout.id,
            status: "paid",
            providerPaymentId: `local_pi_${checkout.id.slice(-12)}`,
            payload: {
              source: "local_auto_confirm",
              method,
            },
          },
          signature: this.signWebhookPayload(
            createdAt,
            {
              eventId: simulatedEventId,
              checkoutId: checkout.id,
              status: "paid",
              providerPaymentId: `local_pi_${checkout.id.slice(-12)}`,
              payload: {
                source: "local_auto_confirm",
                method,
              },
            }
          ),
          timestamp: createdAt,
          allowLocalInsecureFallback: true,
        });
        const fresh = await this.purchasesRepository.findCheckoutById(checkout.id);
        if (fresh) {
          effectiveCheckout = fresh;
        }
      }

      return this.buildCheckoutPurchaseResponse(effectiveCheckout, actorUser ?? undefined);
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

      let effective = checkout;
      if (!checkout.userId && normalizeEmail(checkout.email) === normalizeEmail(actorUser.email)) {
        effective = {
          ...checkout,
          userId: actorUser.id,
          updatedAt: nowIso(),
        };
        await this.purchasesRepository.updateCheckout(effective);
        await this.appendTimelineEvent(effective.id, "checkout_attached", {
          userId: actorUser.id,
        });
      }

      effective = await this.resumeProvisionIfNeeded(effective);
      return this.buildCheckoutPurchaseResponse(effective, actorUser);
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
    if (!params.actorUser) return [];

    if (params.actorUser.role === "teacher") {
      return this.purchasesRepository.listCheckouts({
        userId: params.userId?.trim() || undefined,
        email: normalizeEmail(params.email) || undefined,
        courseId: params.courseId?.trim() || undefined,
      });
    }

    return this.purchasesRepository.listCheckouts({
      userId: params.actorUser.id,
      email: normalizeEmail(params.actorUser.email),
      courseId: params.courseId?.trim() || undefined,
    });
  }

  async getCheckoutStatus(params: {
    checkoutId: string;
    actorUser: AuthUserDto | null;
  }): Promise<CheckoutStatusResponseDto> {
    const checkout = await this.requireCheckoutForActor(params.checkoutId, params.actorUser, {
      allowEmailMatchWithoutUserId: true,
    });

    const effective = await this.resumeProvisionIfNeeded(checkout);
    return this.buildCheckoutStatusResponse(effective);
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

      if (checkout.state === "provider_confirmed" || checkout.state === "provision_pending") {
        throw new HttpException({ error: "Checkout уже подтвержден провайдером." }, 409);
      }
      if (checkout.state === "provisioned" || checkout.state === "email_verification_pending") {
        throw new HttpException({ error: "Checkout уже завершен." }, 409);
      }

      if (
        checkout.state !== "failed" &&
        checkout.state !== "expired" &&
        checkout.state !== "canceled" &&
        checkout.state !== "provision_failed_retryable"
      ) {
        throw new HttpException({ error: "Текущий статус checkout не допускает retry." }, 409);
      }

      const retried: CheckoutProcessDto = {
        ...checkout,
        state: "pending_provider",
        providerEventId: undefined,
        updatedAt: nowIso(),
        expiresAt: buildCheckoutExpiresAt(nowIso()),
      };
      await this.purchasesRepository.updateCheckout(retried);
      await this.appendTimelineEvent(retried.id, "checkout_retry", {
        previousState: checkout.state,
      });

      const effective = await this.resumeProvisionIfNeeded(retried);
      return {
        ok: true,
        checkoutId: effective.id,
        checkoutState: effective.state,
        payment: this.buildPaymentPayload(effective),
        access: await this.buildAccessPayload(effective),
      };
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
        checkout.state === "provider_confirmed" ||
        checkout.state === "provision_pending" ||
        checkout.state === "provisioned" ||
        checkout.state === "email_verification_pending"
      ) {
        throw new HttpException(
          { error: "Подтвержденный checkout нельзя отменить через этот сценарий." },
          409
        );
      }

      if (checkout.state === "failed" || checkout.state === "canceled" || checkout.state === "expired") {
        return {
          ok: true,
          idempotent: true,
          checkout: {
            id: checkout.id,
            state: checkout.state,
          },
        };
      }

      const canceled: CheckoutProcessDto = {
        ...checkout,
        state: "canceled",
        updatedAt: nowIso(),
      };
      await this.purchasesRepository.updateCheckout(canceled);
      await this.appendTimelineEvent(canceled.id, "checkout_canceled", {
        reason: "api_cancel",
      });

      return {
        ok: true,
        checkout: {
          id: canceled.id,
          state: canceled.state,
        },
      };
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

  async handleProviderWebhook(params: {
    payload: ProviderWebhookPayloadDto;
    signature: string;
    timestamp: string;
    allowLocalInsecureFallback?: boolean;
  }): Promise<ProviderWebhookResult> {
    await this.verifyWebhookRequest({
      payload: params.payload,
      signature: params.signature,
      timestamp: params.timestamp,
      allowLocalInsecureFallback: params.allowLocalInsecureFallback,
    });

    const eventId = params.payload.eventId.trim();
    if (!eventId) {
      throw new HttpException({ error: "eventId обязателен." }, 400);
    }

    const dedupeKey = `card:${eventId}`;
    const existingEvent = await this.purchasesRepository.findPaymentEventByDedupeKey(dedupeKey);
    if (existingEvent) {
      const checkout = await this.purchasesRepository.findCheckoutById(existingEvent.checkoutId);
      return {
        ok: true,
        event: {
          status: existingEvent.status,
          outcome: "duplicate",
        },
        checkout: checkout
          ? {
              id: checkout.id,
              state: checkout.state,
            }
          : null,
      };
    }

    const lockKey = `lock:provider:webhook:${params.payload.checkoutId}`;
    return this.withLock(lockKey, async () => {
      const now = nowIso();
      const checkout = await this.purchasesRepository.findCheckoutById(params.payload.checkoutId);
      if (!checkout) {
        await this.purchasesRepository.insertPaymentEvent({
          id: ensureId("pay_evt"),
          provider: "card",
          externalEventId: eventId,
          dedupeKey,
          checkoutId: params.payload.checkoutId,
          status: params.payload.status,
          outcome: "ignored_missing_checkout",
          payload: params.payload.payload ?? null,
          createdAt: now,
          processedAt: now,
        });
        return {
          ok: true,
          event: {
            status: params.payload.status,
            outcome: "ignored_missing_checkout",
          },
          checkout: null,
        };
      }

      const transition = this.computeProviderTransition(checkout.state, params.payload.status);
      let effectiveCheckout = checkout;
      let outcome = transition.outcome;

      if (transition.nextState && transition.nextState !== checkout.state) {
        effectiveCheckout = {
          ...checkout,
          state: transition.nextState,
          providerEventId: eventId,
          providerPaymentId: params.payload.providerPaymentId?.trim() || checkout.providerPaymentId,
          updatedAt: now,
        };
        await this.purchasesRepository.updateCheckout(effectiveCheckout);
        await this.appendTimelineEvent(effectiveCheckout.id, "provider_event", {
          provider: "card",
          status: params.payload.status,
          eventId,
          nextState: effectiveCheckout.state,
        });
      }

      if (
        params.payload.status === "paid" &&
        (effectiveCheckout.state === "provider_confirmed" ||
          effectiveCheckout.state === "provision_pending" ||
          effectiveCheckout.state === "provision_failed_retryable")
      ) {
        try {
          effectiveCheckout = await this.ensureCheckoutProvisioned(effectiveCheckout);
          outcome = "applied";
        } catch {
          outcome = "provision_failed_retryable";
          const refreshed = await this.purchasesRepository.findCheckoutById(
            effectiveCheckout.id
          );
          if (refreshed) {
            effectiveCheckout = refreshed;
          }
        }
      }

      await this.purchasesRepository.insertPaymentEvent({
        id: ensureId("pay_evt"),
        provider: "card",
        externalEventId: eventId,
        dedupeKey,
        checkoutId: effectiveCheckout.id,
        status: params.payload.status,
        outcome,
        payload: params.payload.payload ?? null,
        createdAt: now,
        processedAt: now,
      });

      return {
        ok: true,
        event: {
          status: params.payload.status,
          outcome,
        },
        checkout: {
          id: effectiveCheckout.id,
          state: effectiveCheckout.state,
        },
      };
    });
  }

  async refundProviderCheckout(params: {
    checkoutId: string;
    reason?: string;
    actorUser: AuthUserDto | null;
  }): Promise<ProviderWebhookResult> {
    if (!params.actorUser || params.actorUser.role !== "teacher") {
      throw new HttpException({ error: "Операция доступна только преподавателю." }, 403);
    }

    const checkout = await this.purchasesRepository.findCheckoutById(params.checkoutId.trim());
    if (!checkout) {
      throw new HttpException({ error: "Checkout не найден." }, 404);
    }

    const now = nowIso();
    const nextState: CheckoutStateDto = "canceled";
    if (checkout.state !== "canceled") {
      await this.purchasesRepository.updateCheckout({
        ...checkout,
        state: nextState,
        updatedAt: now,
      });
      await this.appendTimelineEvent(checkout.id, "provider_refund", {
        reason: params.reason?.trim() || "manual_refund",
      });
    }

    await this.purchasesRepository.insertPaymentEvent({
      id: ensureId("pay_evt"),
      provider: "card",
      externalEventId: ensureId("refund"),
      dedupeKey: `card:refund:${checkout.id}:${now}`,
      checkoutId: checkout.id,
      status: "canceled",
      outcome: "applied",
      payload: {
        reason: params.reason?.trim() || "manual_refund",
      },
      createdAt: now,
      processedAt: now,
    });

    return {
      ok: true,
      event: {
        status: "canceled",
        outcome: "applied",
      },
      checkout: {
        id: checkout.id,
        state: nextState,
      },
    };
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
            status: completed ? "paid" : "provider_confirmed",
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

  private async verifyWebhookRequest(params: {
    payload: ProviderWebhookPayloadDto;
    signature: string;
    timestamp: string;
    allowLocalInsecureFallback?: boolean;
  }) {
    const timestamp = params.timestamp?.trim();
    const signature = params.signature?.trim();
    if (!timestamp || !signature) {
      throw new HttpException({ error: "Webhook headers are required." }, 400);
    }

    const tsMs = Date.parse(timestamp);
    if (!Number.isFinite(tsMs)) {
      throw new HttpException({ error: "Invalid webhook timestamp." }, 400);
    }

    const skewSec = Math.abs(Date.now() - tsMs) / 1000;
    if (skewSec > this.runtimeConfig.cardWebhookMaxSkewSec) {
      throw new HttpException({ error: "Webhook timestamp is stale." }, 409);
    }

    const expected = this.signWebhookPayload(timestamp, params.payload);
    const allowFallback =
      this.runtimeConfig.appEnv === "local" && params.allowLocalInsecureFallback;
    if (!allowFallback && !timingSafeEquals(signature, expected)) {
      throw new HttpException({ error: "Webhook signature mismatch." }, 401);
    }

    const replayKey = `card:webhook:replay:${signature}`;
    const acquired = await this.redisService.setIfAbsent(
      replayKey,
      "1",
      this.runtimeConfig.cardWebhookReplayTtlSec
    );
    if (!acquired) {
      throw new HttpException({ error: "Webhook replay detected." }, 409);
    }
  }

  private signWebhookPayload(timestamp: string, payload: ProviderWebhookPayloadDto) {
    return crypto
      .createHmac("sha256", this.runtimeConfig.cardWebhookSecret)
      .update(`${timestamp}.${JSON.stringify(payload)}`)
      .digest("hex");
  }

  private computeProviderTransition(
    current: CheckoutStateDto,
    status: ProviderWebhookPayloadDto["status"]
  ): { nextState: CheckoutStateDto | null; outcome: string } {
    if (status === "paid") {
      if (
        current === "provider_confirmed" ||
        current === "provision_pending" ||
        current === "provisioned" ||
        current === "email_verification_pending"
      ) {
        return { nextState: current, outcome: "duplicate" };
      }
      if (current === "failed" || current === "canceled" || current === "expired") {
        return { nextState: null, outcome: "ignored_out_of_order" };
      }
      return { nextState: "provider_confirmed", outcome: "applied" };
    }

    if (status === "awaiting_payment") {
      if (isTerminalCheckoutState(current)) {
        return { nextState: null, outcome: "ignored_out_of_order" };
      }
      return { nextState: "pending_provider", outcome: "applied" };
    }

    if (status === "failed") {
      if (current === "provisioned" || current === "email_verification_pending") {
        return { nextState: null, outcome: "ignored_out_of_order" };
      }
      return { nextState: "failed", outcome: "applied" };
    }

    if (status === "canceled") {
      if (current === "provisioned" || current === "email_verification_pending") {
        return { nextState: null, outcome: "ignored_out_of_order" };
      }
      return { nextState: "canceled", outcome: "applied" };
    }

    if (status === "expired") {
      if (current === "provisioned" || current === "email_verification_pending") {
        return { nextState: null, outcome: "ignored_out_of_order" };
      }
      return { nextState: "expired", outcome: "applied" };
    }

    return { nextState: null, outcome: "ignored_out_of_order" };
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

  private async resumeProvisionIfNeeded(
    checkout: CheckoutProcessDto
  ): Promise<CheckoutProcessDto> {
    if (
      checkout.state !== "provider_confirmed" &&
      checkout.state !== "provision_pending" &&
      checkout.state !== "provision_failed_retryable"
    ) {
      return checkout;
    }
    return this.ensureCheckoutProvisioned(checkout);
  }

  private async ensureCheckoutProvisioned(
    checkout: CheckoutProcessDto
  ): Promise<CheckoutProcessDto> {
    if (
      checkout.state !== "provider_confirmed" &&
      checkout.state !== "provision_pending" &&
      checkout.state !== "provision_failed_retryable"
    ) {
      return checkout;
    }

    const now = nowIso();
    const provisioningCheckout: CheckoutProcessDto =
      checkout.state === "provision_pending"
        ? checkout
        : {
            ...checkout,
            state: "provision_pending",
            updatedAt: now,
          };

    if (provisioningCheckout !== checkout) {
      await this.purchasesRepository.updateCheckout(provisioningCheckout);
      await this.appendTimelineEvent(provisioningCheckout.id, "provision_pending", {
        sourceState: checkout.state,
      });
    }

    try {
      const identity = await this.authService.ensureUserByEmail({
        email: provisioningCheckout.email,
        firstName: provisioningCheckout.firstName,
        lastName: provisioningCheckout.lastName,
        phone: provisioningCheckout.phone,
      });

      const boundCheckout: CheckoutProcessDto =
        provisioningCheckout.userId === identity.user.id
          ? provisioningCheckout
          : {
              ...provisioningCheckout,
              userId: identity.user.id,
              updatedAt: nowIso(),
            };

      if (boundCheckout !== provisioningCheckout) {
        await this.purchasesRepository.updateCheckout(boundCheckout);
        await this.appendTimelineEvent(boundCheckout.id, "identity_bound", {
          userId: identity.user.id,
          isNewUser: identity.isNew,
        });
      }

      const course = await this.coursesRepository.findById(boundCheckout.courseId);
      if (!course) {
        throw new HttpException({ error: "Курс не найден во время provisioning." }, 404);
      }
      const lessons = await this.lessonsRepository.findAll(boundCheckout.courseId);

      const existingPurchase = await this.purchasesRepository.findPurchaseByUserAndCourse(
        identity.user.id,
        boundCheckout.courseId
      );

      const purchase: PurchaseRecordDto = {
        id: existingPurchase?.id ?? ensureId("purchase"),
        userId: identity.user.id,
        courseId: boundCheckout.courseId,
        price: boundCheckout.amount,
        purchasedAt: nowIso(),
        paymentMethod: boundCheckout.method,
        checkoutId: boundCheckout.id,
        bnpl:
          boundCheckout.method === "bnpl"
            ? {
                provider: "unknown",
                plan: {
                  installmentsCount: normalizeInstallmentsCount(boundCheckout.bnplInstallmentsCount),
                  paidCount: 1,
                  nextPaymentDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                  schedule: Array.from(
                    { length: normalizeInstallmentsCount(boundCheckout.bnplInstallmentsCount) },
                    (_, index) => ({
                      dueDate: new Date(
                        Date.now() + index * 14 * 24 * 60 * 60 * 1000
                      ).toISOString(),
                      amount: Math.max(
                        0,
                        Math.ceil(
                          boundCheckout.amount /
                            normalizeInstallmentsCount(boundCheckout.bnplInstallmentsCount)
                        )
                      ),
                      status: index === 0 ? "paid" : "due",
                    })
                  ),
                },
                installmentsCount: normalizeInstallmentsCount(boundCheckout.bnplInstallmentsCount),
                paidCount: 1,
                lastKnownStatus: "active",
              }
            : existingPurchase?.bnpl,
        courseSnapshot: course,
        lessonsSnapshot: lessons,
        purchasedTestItemIds: existingPurchase?.purchasedTestItemIds,
      };

      const isIdentityVerified = !identity.isNew;
      const finalState: CheckoutStateDto = identity.isNew
        ? "email_verification_pending"
        : "provisioned";
      const finalCheckout: CheckoutProcessDto = {
        ...boundCheckout,
        state: finalState,
        updatedAt: nowIso(),
      };

      await this.purchasesRepository.provisionCheckoutAtomic({
        checkout: finalCheckout,
        purchase,
        accessContext: {
          userId: identity.user.id,
          email: identity.user.email,
          role: identity.user.role,
          isIdentityVerified,
          courseId: finalCheckout.courseId,
          hasActiveEntitlement: true,
        },
        entitlement: {
          id: ensureId("entl"),
          state: "active",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      });

      await this.purchasesRepository.upsertConsentRecords({
        checkoutId: finalCheckout.id,
        email: finalCheckout.email,
        scopes: finalCheckout.consentSnapshot ?? [],
        acceptedAt: finalCheckout.createdAt,
      });

      await this.appendTimelineEvent(finalCheckout.id, "checkout_provisioned", {
        userId: identity.user.id,
        purchaseId: purchase.id,
        identityState: isIdentityVerified ? "verified" : "unverified",
      });

      if (identity.isNew) {
        await this.notificationsService.enqueueAndDispatch({
          id: ensureId("outbox"),
          template: "registration",
          dedupeKey: `registration:${identity.user.id}:${finalCheckout.id}`,
          recipientEmail: identity.user.email,
          userId: identity.user.id,
          checkoutId: finalCheckout.id,
          payload: {
            reason: "provider_confirmed_payment",
            checkoutId: finalCheckout.id,
          },
        });
      }

      await this.notificationsService.enqueueAndDispatch({
        id: ensureId("outbox"),
        template: "purchase_confirmed",
        dedupeKey: `purchase_confirmed:${purchase.id}`,
        recipientEmail: identity.user.email,
        userId: identity.user.id,
        checkoutId: finalCheckout.id,
        payload: {
          purchaseId: purchase.id,
          courseId: purchase.courseId,
          amount: purchase.price,
        },
      });

      await this.notificationsService.enqueueAndDispatch({
        id: ensureId("outbox"),
        template: "purchase_access_granted",
        dedupeKey: `purchase_access_granted:${purchase.id}`,
        recipientEmail: identity.user.email,
        userId: identity.user.id,
        checkoutId: finalCheckout.id,
        payload: {
          purchaseId: purchase.id,
          courseId: purchase.courseId,
          accessState: finalState,
        },
      });

      if (!identity.isNew) {
        await this.notificationsService.enqueueAndDispatch({
          id: ensureId("outbox"),
          template: "login_hint",
          dedupeKey: `login_hint:purchase:${identity.user.id}:${finalCheckout.id}`,
          recipientEmail: identity.user.email,
          userId: identity.user.id,
          checkoutId: finalCheckout.id,
          payload: {
            reason: "existing_user_purchase",
            checkoutId: finalCheckout.id,
          },
        });
      }

      return finalCheckout;
    } catch (error) {
      const failedCheckout: CheckoutProcessDto = {
        ...provisioningCheckout,
        state: "provision_failed_retryable",
        updatedAt: nowIso(),
      };
      await this.purchasesRepository.updateCheckout(failedCheckout);
      await this.appendTimelineEvent(failedCheckout.id, "provision_failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
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

  private buildPaymentPayload(checkout: CheckoutProcessDto): CheckoutPaymentDto {
    const status: CheckoutPaymentDto["status"] =
      checkout.state === "created" || checkout.state === "pending_provider"
        ? "awaiting_provider"
        : checkout.state === "provider_confirmed" ||
            checkout.state === "provision_pending" ||
            checkout.state === "provisioned" ||
            checkout.state === "email_verification_pending" ||
            checkout.state === "email_correction_required"
          ? "provider_confirmed"
          : checkout.state === "failed" || checkout.state === "provision_failed_retryable"
            ? "failed"
            : checkout.state === "canceled"
              ? "canceled"
              : "expired";

    const outcome: CheckoutPaymentDto["outcome"] =
      status === "awaiting_provider"
        ? "awaiting_provider_event"
        : status === "provider_confirmed"
          ? "applied"
          : status === "canceled" || status === "expired"
            ? "canceled"
            : "failed";

    const base: CheckoutPaymentDto = {
      provider: checkout.method,
      status,
      outcome,
      providerPaymentId:
        checkout.providerPaymentId ?? `${checkout.method}_pi_${checkout.id.slice(-12)}`,
      requiresConfirmation: false,
      lastProcessedAt: status === "awaiting_provider" ? null : checkout.updatedAt,
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

  private async buildCheckoutStatusResponse(
    checkout: CheckoutProcessDto
  ): Promise<CheckoutStatusResponseDto> {
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
      payment: this.buildPaymentPayload(checkout),
      access: await this.buildAccessPayload(checkout),
    };
  }

  private async buildCheckoutPurchaseResponse(
    checkout: CheckoutProcessDto,
    actorUser?: AuthUserDto
  ): Promise<CheckoutPurchaseResponseDto> {
    const access = await this.buildAccessPayload(checkout);
    return {
      user: actorUser,
      checkoutId: checkout.id,
      checkoutState: checkout.state,
      payment: this.buildPaymentPayload(checkout),
      identityState: access?.identityState ?? "unverified",
      entitlementState: access?.entitlementState ?? "none",
      profileComplete: access?.profileComplete ?? false,
      accessState: access?.accessState ?? "awaiting_profile",
    };
  }

  private async appendTimelineEvent(
    checkoutId: string,
    type: string,
    details: Record<string, unknown>
  ) {
    await this.purchasesRepository.addCheckoutTimelineEvent({
      id: ensureId("checkout_evt"),
      checkoutId,
      type,
      details,
      createdAt: nowIso(),
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
