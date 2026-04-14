import {
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { AuthIdentityIntentService } from "../auth/auth.identity-intent.service";
import type { AuthUserDto } from "../auth/auth.types";
import { AuthService } from "../auth/auth.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import {
  STAGE_RUNTIME_MARKER,
  isStagePaymentConfirmRuntimeEnabled,
} from "../config/runtime.governance";
import { CoursesRepository } from "../courses/courses.repository";
import { LessonsRepository } from "../lessons/lessons.repository";
import { MediaService } from "../media/media.service";
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
} from "./purchases.helpers";
import {
  buildCheckoutProviderPayload,
  resolveCheckoutIdentityContext,
} from "./purchases.identity-orchestration";
import { PurchasesProvisioningOrchestrator } from "./purchases.provisioning-orchestrator";
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
import {
  buildPaymentPayload,
  computeProviderTransition,
  readCourseSnapshotPrice,
  resolveCheckoutTariff,
  signWebhookPayload,
  verifyWebhookRequest,
} from "./purchases.service.runtime";
import {
  buildYooKassaIdempotenceKey,
  createYooKassaPayment,
  isYooKassaEnabled,
  parseYooKassaWebhookPayload,
} from "./purchases.yookassa";

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

@Injectable()
export class PurchasesService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly logger = new Logger(PurchasesService.name);
  private readonly provisioningOrchestrator: PurchasesProvisioningOrchestrator;

  constructor(
    private readonly purchasesRepository: PurchasesRepository,
    private readonly coursesRepository: CoursesRepository,
    private readonly lessonsRepository: LessonsRepository,
    private readonly mediaService: MediaService,
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
    @Optional()
    private readonly authIdentityIntentService: AuthIdentityIntentService | null = null
  ) {
    this.provisioningOrchestrator = new PurchasesProvisioningOrchestrator({
      purchasesRepository: this.purchasesRepository,
      coursesRepository: this.coursesRepository,
      lessonsRepository: this.lessonsRepository,
      authService: this.authService,
      notificationsService: this.notificationsService,
      authIdentityIntentService: this.authIdentityIntentService,
      logger: this.logger,
    });
  }

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
    await this.mediaService.processOrphanCandidates(200);
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
    if (method === "mock" && !this.runtimeConfig.paymentMockEnabled) {
      throw new HttpException(
        { error: "Метод оплаты mock запрещен в текущем runtime." },
        400
      );
    }
    const courseId = payload.courseId?.trim();
    if (!courseId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }

    const course = await this.coursesRepository.findPublishedById(courseId);
    if (!course) {
      throw new HttpException({ error: "Курс не найден." }, 404);
    }

    if (!actorUser && payload.userId) {
      throw new HttpException({ error: "Недопустимый checkout context." }, 401);
    }

    if (actorUser && payload.userId && payload.userId !== actorUser.id) {
      throw new HttpException({ error: "Недопустимый checkout context." }, 403);
    }

    const checkoutIdentity = await this.resolveCheckoutIdentityContext({
      actorUser,
      payload,
    });
    const email = checkoutIdentity.email;
    const identityIntent = checkoutIdentity.identityIntent;

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
    const tariff = resolveCheckoutTariff(payload.tariff, "standard");

    const acceptedScopes = payload.consents?.acceptedScopes ?? [];
    if (!Array.isArray(acceptedScopes) || acceptedScopes.length === 0) {
      throw new HttpException({ error: "Необходимо принять обязательные согласия." }, 400);
    }

    const lockKey = `lock:purchase:checkout:create:${actorUser?.id ?? email}:${courseId}`;
    const response = await this.withLock(lockKey, async () => {
      if (identityIntent?.intentId) {
        const existingByIntent =
          await this.purchasesRepository.findLatestCheckoutByIdentityIntentId(
            identityIntent.intentId
          );
        if (existingByIntent) {
          const maybeProvisioned = await this.resumeProvisionIfNeeded(existingByIntent);
          return this.buildCheckoutPurchaseResponse(
            maybeProvisioned,
            actorUser ?? undefined
          );
        }
      }

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
        tariff,
        currency: "RUB",
        state: "pending_provider",
        providerPayload: this.buildCheckoutProviderPayload({
          identityIntentId: identityIntent?.intentId,
          identityIntentChannel: identityIntent?.channel,
          identityIntentVerifiedAt: identityIntent?.verifiedAt,
        }),
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
      if (this.shouldUseYooKassaProvider(checkout.method)) {
        effectiveCheckout = await this.createYooKassaPaymentForCheckout(
          effectiveCheckout,
          "create"
        );
      } else if (
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
          signature: signWebhookPayload(
            this.runtimeConfig.cardWebhookSecret,
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

      let effective = retried;
      if (this.shouldUseYooKassaProvider(retried.method)) {
        effective = await this.createYooKassaPaymentForCheckout(effective, "retry");
      }
      effective = await this.resumeProvisionIfNeeded(effective);
      return {
        ok: true,
        checkoutId: effective.id,
        checkoutState: effective.state,
        payment: buildPaymentPayload(effective),
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

  async stageConfirmCheckout(params: {
    checkoutId: string;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<CheckoutActionResponseDto> {
    if (!isStagePaymentConfirmRuntimeEnabled(this.runtimeConfig)) {
      throw new HttpException(
        {
          error: "Stage payment confirm недоступен в текущем runtime.",
          code: "stage_payment_confirm_unavailable",
          marker: STAGE_RUNTIME_MARKER,
        },
        404
      );
    }

    if (isYooKassaEnabled(this.runtimeConfig)) {
      throw new HttpException(
        {
          error:
            "Stage payment confirm отключен при активной YooKassa-интеграции. Используйте реальный provider flow.",
          code: "stage_payment_confirm_disabled_for_provider",
        },
        409
      );
    }

    if (!params.actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    if (params.actorUser.role !== "student") {
      throw new HttpException(
        { error: "Stage payment confirm доступен только студенту." },
        403
      );
    }
    const actorUser = params.actorUser;

    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.purchasesRepository.findIdempotentResponse<CheckoutActionResponseDto>(
        "purchase:checkout:stage_confirm",
        normalizedIdempotency
      );
      if (cached) return cached;
    }

    const lockKey = `lock:purchase:checkout:stage_confirm:${params.checkoutId}`;
    const response = await this.withLock(lockKey, async () => {
      const checkout = await this.requireCheckoutForActor(
        params.checkoutId,
        actorUser,
        { allowEmailMatchWithoutUserId: true }
      );

      if (
        checkout.state === "provider_confirmed" ||
        checkout.state === "provision_pending" ||
        checkout.state === "provision_failed_retryable" ||
        checkout.state === "provisioned" ||
        checkout.state === "email_verification_pending"
      ) {
        const effective = await this.resumeProvisionIfNeeded(checkout);
        const status = await this.buildCheckoutStatusResponse(effective);
        return {
          ok: true,
          checkoutId: effective.id,
          checkoutState: effective.state,
          payment: status.payment,
          access: status.access,
          confirmationSource: "stage_stub" as const,
        };
      }

      if (checkout.state !== "created" && checkout.state !== "pending_provider") {
        throw new HttpException(
          {
            error:
              "Текущий статус checkout не допускает stage test confirm. Создайте новый checkout или выполните retry.",
          },
          409
        );
      }

      const timestamp = nowIso();
      const eventId = `stage_stub_${checkout.id}_${Date.now()}`;
      const providerPaymentId = `stage_stub_pi_${checkout.id.slice(-12)}`;
      const payload: ProviderWebhookPayloadDto = {
        eventId,
        checkoutId: checkout.id,
        status: "paid",
        providerPaymentId,
        payload: {
          source: "stage_stub",
          marker: STAGE_RUNTIME_MARKER,
          actorUserId: actorUser.id,
        },
      };

      await this.appendTimelineEvent(checkout.id, "stage_confirm_requested", {
        eventId,
        providerPaymentId,
        actorUserId: actorUser.id,
        marker: STAGE_RUNTIME_MARKER,
      });

      await this.handleProviderWebhook({
        payload,
        signature: signWebhookPayload(
          this.runtimeConfig.cardWebhookSecret,
          timestamp,
          payload
        ),
        timestamp,
      });

      const refreshed = await this.purchasesRepository.findCheckoutById(checkout.id);
      const effective = refreshed
        ? await this.resumeProvisionIfNeeded(refreshed)
        : checkout;
      const status = await this.buildCheckoutStatusResponse(effective);

      await this.appendTimelineEvent(effective.id, "stage_confirm_applied", {
        state: effective.state,
        actorUserId: actorUser.id,
        marker: STAGE_RUNTIME_MARKER,
      });

      return {
        ok: true,
        checkoutId: effective.id,
        checkoutState: effective.state,
        payment: status.payment,
        access: status.access,
        confirmationSource: "stage_stub" as const,
      };
    });

    if (normalizedIdempotency) {
      await this.purchasesRepository.saveIdempotentResponse(
        "purchase:checkout:stage_confirm",
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
    await verifyWebhookRequest({
      payload: params.payload,
      signature: params.signature,
      timestamp: params.timestamp,
      allowLocalInsecureFallback: params.allowLocalInsecureFallback,
      runtimeConfig: this.runtimeConfig,
      redisService: this.redisService,
    });
    return this.processProviderWebhookEvent({
      provider: "card",
      payload: params.payload,
    });
  }

  async handleYooKassaWebhook(params: {
    payload: unknown;
  }): Promise<ProviderWebhookResult> {
    if (!isYooKassaEnabled(this.runtimeConfig) || !this.runtimeConfig.yookassaWebhookEnabled) {
      throw new HttpException(
        { error: "YooKassa webhook endpoint disabled in current runtime." },
        404
      );
    }

    const parsed = parseYooKassaWebhookPayload(params.payload);
    let checkoutId = parsed.checkoutId;
    if (!checkoutId && parsed.providerPaymentId) {
      const checkout = await this.purchasesRepository.findCheckoutByProviderPaymentId(
        parsed.providerPaymentId
      );
      checkoutId = checkout?.id;
    }

    if (!checkoutId) {
      this.logger.warn(
        JSON.stringify({
          event: "payment_webhook_unmatched",
          provider: "yookassa",
          eventId: parsed.eventId,
          providerPaymentId: parsed.providerPaymentId,
          reason: "missing_checkout_mapping",
        })
      );
      return {
        ok: true,
        event: {
          status: parsed.status,
          outcome: "ignored_missing_checkout",
        },
        checkout: null,
      };
    }

    return this.processProviderWebhookEvent({
      provider: "yookassa",
      payload: {
        eventId: parsed.eventId,
        checkoutId,
        status: parsed.status,
        providerPaymentId: parsed.providerPaymentId,
        payload: parsed.payload,
      },
    });
  }

  private async processProviderWebhookEvent(params: {
    provider: "card" | "yookassa";
    payload: ProviderWebhookPayloadDto;
  }): Promise<ProviderWebhookResult> {
    const eventId = params.payload.eventId.trim();
    if (!eventId) {
      throw new HttpException({ error: "eventId обязателен." }, 400);
    }
    const checkoutId = params.payload.checkoutId?.trim();
    if (!checkoutId) {
      throw new HttpException({ error: "checkoutId обязателен." }, 400);
    }

    const dedupeKey = `${params.provider}:${eventId}`;
    this.logger.log(
      JSON.stringify({
        event: "payment_webhook_received",
        provider: params.provider,
        eventId,
        checkoutId,
        status: params.payload.status,
      })
    );
    const existingEvent = await this.purchasesRepository.findPaymentEventByDedupeKey(
      dedupeKey
    );
    if (existingEvent) {
      const checkout = await this.purchasesRepository.findCheckoutById(
        existingEvent.checkoutId
      );
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

    const lockKey = `lock:provider:webhook:${checkoutId}`;
    return this.withLock(lockKey, async () => {
      const now = nowIso();
      const checkout = await this.purchasesRepository.findCheckoutById(checkoutId);
      if (!checkout) {
        await this.purchasesRepository.insertPaymentEvent({
          id: ensureId("pay_evt"),
          provider: params.provider,
          externalEventId: eventId,
          dedupeKey,
          checkoutId,
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

      const transition = computeProviderTransition(checkout.state, params.payload.status);
      let effectiveCheckout = checkout;
      let outcome = transition.outcome;
      const currentPayload =
        checkout.providerPayload &&
        typeof checkout.providerPayload === "object" &&
        !Array.isArray(checkout.providerPayload)
          ? (checkout.providerPayload as Record<string, unknown>)
          : {};
      const webhookPayload =
        params.payload.payload &&
        typeof params.payload.payload === "object" &&
        !Array.isArray(params.payload.payload)
          ? (params.payload.payload as Record<string, unknown>)
          : {};

      const hasProviderContextUpdate =
        Boolean(params.payload.providerPaymentId?.trim()) ||
        Object.keys(webhookPayload).length > 0;
      const shouldUpdateCheckout =
        Boolean(transition.nextState) &&
        (transition.nextState !== checkout.state || hasProviderContextUpdate);

      if (shouldUpdateCheckout && transition.nextState) {
        effectiveCheckout = {
          ...checkout,
          state: transition.nextState,
          providerEventId: eventId,
          providerPaymentId:
            params.payload.providerPaymentId?.trim() || checkout.providerPaymentId,
          providerPayload: {
            ...currentPayload,
            ...webhookPayload,
            provider: params.provider,
            providerStatus: params.payload.status,
          },
          updatedAt: now,
        };
        await this.purchasesRepository.updateCheckout(effectiveCheckout);
        await this.appendTimelineEvent(effectiveCheckout.id, "provider_event", {
          provider: params.provider,
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
        provider: params.provider,
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

  private shouldUseYooKassaProvider(method: CheckoutProcessDto["method"]) {
    return isYooKassaEnabled(this.runtimeConfig) && (method === "card" || method === "sbp");
  }

  private async createYooKassaPaymentForCheckout(
    checkout: CheckoutProcessDto,
    scope: "create" | "retry"
  ): Promise<CheckoutProcessDto> {
    if (!this.shouldUseYooKassaProvider(checkout.method)) {
      return checkout;
    }

    const idempotenceKey = buildYooKassaIdempotenceKey({
      checkoutId: checkout.id,
      scope,
      stamp: checkout.updatedAt,
    });

    this.logger.log(
      JSON.stringify({
        event: "payment_create_attempt",
        provider: "yookassa",
        checkoutId: checkout.id,
        method: checkout.method,
        amount: checkout.amount,
        currency: checkout.currency,
        webhookPath: this.runtimeConfig.yookassaWebhookPath,
      })
    );

    try {
      const createdPayment = await createYooKassaPayment({
        checkout,
        runtimeConfig: this.runtimeConfig,
        idempotenceKey,
      });
      let updatedCheckout: CheckoutProcessDto = {
        ...checkout,
        providerPaymentId: createdPayment.paymentId,
        providerPayload: createdPayment.providerPayload,
        updatedAt: nowIso(),
      };
      await this.purchasesRepository.updateCheckout(updatedCheckout);
      await this.appendTimelineEvent(updatedCheckout.id, "provider_payment_created", {
        provider: "yookassa",
        providerPaymentId: createdPayment.paymentId,
        providerStatus: createdPayment.providerStatus,
      });

      if (createdPayment.normalizedStatus && createdPayment.normalizedStatus !== "awaiting_payment") {
        const webhookResult = await this.processProviderWebhookEvent({
          provider: "yookassa",
          payload: {
            eventId: `yk:create:${createdPayment.paymentId}:${createdPayment.providerStatus}`,
            checkoutId: updatedCheckout.id,
            status: createdPayment.normalizedStatus,
            providerPaymentId: createdPayment.paymentId,
            payload: {
              provider: "yookassa",
              source: "create_payment_response",
              providerStatus: createdPayment.providerStatus,
            },
          },
        });
        if (webhookResult.checkout) {
          const refreshed = await this.purchasesRepository.findCheckoutById(
            webhookResult.checkout.id
          );
          if (refreshed) {
            updatedCheckout = refreshed;
          }
        }
      }

      this.logger.log(
        JSON.stringify({
          event: "payment_create_success",
          provider: "yookassa",
          checkoutId: updatedCheckout.id,
          providerPaymentId: createdPayment.paymentId,
          providerStatus: createdPayment.providerStatus,
        })
      );

      return updatedCheckout;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "provider_error";
      const failedCheckout: CheckoutProcessDto = {
        ...checkout,
        state: "failed",
        providerPayload: {
          ...(checkout.providerPayload &&
          typeof checkout.providerPayload === "object" &&
          !Array.isArray(checkout.providerPayload)
            ? (checkout.providerPayload as Record<string, unknown>)
            : {}),
          provider: "yookassa",
          error: reason,
          source: "create_payment",
        },
        updatedAt: nowIso(),
      };
      await this.purchasesRepository.updateCheckout(failedCheckout);
      await this.appendTimelineEvent(failedCheckout.id, "provider_payment_create_failed", {
        provider: "yookassa",
        reason,
      });
      this.logger.error(
        JSON.stringify({
          event: "payment_create_failed",
          provider: "yookassa",
          checkoutId: checkout.id,
          reason,
        })
      );
      throw error;
    }
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

    const purchase = await this.purchasesRepository.findPurchaseByCheckoutId(checkout.id);
    if (purchase) {
      await this.purchasesRepository.revokePurchaseAccessAtomic({
        userId: purchase.userId,
        courseId: purchase.courseId,
        purchaseId: purchase.id,
        updatedAt: now,
      });
      await this.appendTimelineEvent(checkout.id, "entitlement_revoked", {
        purchaseId: purchase.id,
        courseId: purchase.courseId,
      });
    }

    await this.purchasesRepository.insertPaymentEvent({
      id: ensureId("pay_evt"),
      provider:
        checkout.providerPayload &&
        typeof checkout.providerPayload === "object" &&
        !Array.isArray(checkout.providerPayload) &&
        typeof (checkout.providerPayload as Record<string, unknown>).provider === "string"
          ? ((checkout.providerPayload as Record<string, unknown>).provider as string)
          : "card",
      externalEventId: ensureId("refund"),
      dedupeKey: `refund:${checkout.id}:${now}`,
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
        ? buildPaymentPayload(checkout)
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

  private async resolveCheckoutIdentityContext(params: {
    payload: CheckoutPayloadDto;
    actorUser: AuthUserDto | null;
  }) {
    return resolveCheckoutIdentityContext({
      payload: params.payload,
      actorUser: params.actorUser,
      runtimeConfig: this.runtimeConfig,
      authIdentityIntentService: this.authIdentityIntentService,
    });
  }

  private buildCheckoutProviderPayload(params: {
    identityIntentId?: string;
    identityIntentChannel?: string;
    identityIntentVerifiedAt?: string | null;
  }) {
    return buildCheckoutProviderPayload(params);
  }

  private async resumeProvisionIfNeeded(checkout: CheckoutProcessDto) {
    return this.provisioningOrchestrator.resumeProvisionIfNeeded(
      checkout,
      this.appendTimelineEvent.bind(this)
    );
  }

  private async ensureCheckoutProvisioned(checkout: CheckoutProcessDto) {
    return this.provisioningOrchestrator.ensureCheckoutProvisioned(
      checkout,
      this.appendTimelineEvent.bind(this)
    );
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
    const identityCompletion = await this.readIdentityCompletionPayload(checkout);
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
      payment: buildPaymentPayload(checkout),
      access: await this.buildAccessPayload(checkout),
      identityCompletionState: identityCompletion?.identityCompletionState,
      firstPasswordRequired: identityCompletion?.firstPasswordRequired,
      identityCompleted: identityCompletion?.identityCompleted,
    };
  }

  private async buildCheckoutPurchaseResponse(
    checkout: CheckoutProcessDto,
    actorUser?: AuthUserDto
  ): Promise<CheckoutPurchaseResponseDto> {
    const access = await this.buildAccessPayload(checkout);
    const identityCompletion = await this.readIdentityCompletionPayload(checkout);
    return {
      user: actorUser,
      checkoutId: checkout.id,
      checkoutState: checkout.state,
      payment: buildPaymentPayload(checkout),
      identityState: access?.identityState ?? "unverified",
      entitlementState: access?.entitlementState ?? "none",
      profileComplete: access?.profileComplete ?? false,
      accessState: access?.accessState ?? "awaiting_profile",
      identityCompletionState: identityCompletion?.identityCompletionState,
      firstPasswordRequired: identityCompletion?.firstPasswordRequired,
      identityCompleted: identityCompletion?.identityCompleted,
    };
  }

  private async readIdentityCompletionPayload(checkout: CheckoutProcessDto): Promise<{
    identityCompletionState: CheckoutStatusResponseDto["identityCompletionState"];
    firstPasswordRequired: boolean;
    identityCompleted: boolean;
  } | null> {
    if (!checkout.userId) {
      return null;
    }
    try {
      const completion = await this.authService.getIdentityCompletionStatus(checkout.userId);
      return {
        identityCompletionState: completion.completionState,
        firstPasswordRequired: completion.firstPasswordRequired,
        identityCompleted: completion.completionState === "completed",
      };
    } catch {
      return null;
    }
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
