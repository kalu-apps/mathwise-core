import { HttpException, Logger } from "@nestjs/common";
import type { AuthIdentityIntentService } from "../auth/auth.identity-intent.service";
import { AuthService } from "../auth/auth.service";
import { CoursesRepository } from "../courses/courses.repository";
import { LessonsRepository } from "../lessons/lessons.repository";
import { NotificationsService } from "../notifications/notifications.service";
import {
  ensureId,
  normalizeInstallmentsCount,
  nowIso,
} from "./purchases.helpers";
import { PurchasesRepository } from "./purchases.repository";
import type {
  CheckoutProcessDto,
  CheckoutStateDto,
  PurchaseRecordDto,
} from "./purchases.types";
import {
  consumeIdentityIntentAfterProvision,
  extractIdentityIntentIdFromCheckout,
} from "./purchases.identity-orchestration";

type AppendTimelineEvent = (
  checkoutId: string,
  type: string,
  details: Record<string, unknown>
) => Promise<void>;

export class PurchasesProvisioningOrchestrator {
  constructor(
    private readonly deps: {
      purchasesRepository: PurchasesRepository;
      coursesRepository: CoursesRepository;
      lessonsRepository: LessonsRepository;
      authService: AuthService;
      notificationsService: NotificationsService;
      authIdentityIntentService: AuthIdentityIntentService | null;
      logger: Logger;
    }
  ) {}

  async resumeProvisionIfNeeded(
    checkout: CheckoutProcessDto,
    appendTimelineEvent: AppendTimelineEvent
  ): Promise<CheckoutProcessDto> {
    if (
      checkout.state !== "provider_confirmed" &&
      checkout.state !== "provision_pending" &&
      checkout.state !== "provision_failed_retryable"
    ) {
      return checkout;
    }
    return this.ensureCheckoutProvisioned(checkout, appendTimelineEvent);
  }

  async ensureCheckoutProvisioned(
    checkout: CheckoutProcessDto,
    appendTimelineEvent: AppendTimelineEvent
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
      await this.deps.purchasesRepository.updateCheckout(provisioningCheckout);
      await appendTimelineEvent(provisioningCheckout.id, "provision_pending", {
        sourceState: checkout.state,
      });
    }

    try {
      const identity = await this.deps.authService.ensureUserByEmail({
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
        await this.deps.purchasesRepository.updateCheckout(boundCheckout);
        await appendTimelineEvent(boundCheckout.id, "identity_bound", {
          userId: identity.user.id,
          isNewUser: identity.isNew,
        });
      }

      const course = await this.deps.coursesRepository.findPublishedById(
        boundCheckout.courseId
      );
      if (!course) {
        throw new HttpException({ error: "Курс не найден во время provisioning." }, 404);
      }
      const lessons = await this.deps.lessonsRepository.findAll(boundCheckout.courseId);

      const existingPurchase =
        await this.deps.purchasesRepository.findPurchaseByUserAndCourse(
          identity.user.id,
          boundCheckout.courseId
        );

      const purchase: PurchaseRecordDto = {
        id: existingPurchase?.id ?? ensureId("purchase"),
        userId: identity.user.id,
        courseId: boundCheckout.courseId,
        price: boundCheckout.amount,
        tariff: boundCheckout.tariff ?? existingPurchase?.tariff ?? "standard",
        purchasedAt: nowIso(),
        paymentMethod: boundCheckout.method,
        checkoutId: boundCheckout.id,
        bnpl:
          boundCheckout.method === "bnpl"
            ? {
                provider: "unknown",
                plan: {
                  installmentsCount: normalizeInstallmentsCount(
                    boundCheckout.bnplInstallmentsCount
                  ),
                  paidCount: 1,
                  nextPaymentDate: new Date(
                    Date.now() + 14 * 24 * 60 * 60 * 1000
                  ).toISOString(),
                  schedule: Array.from(
                    {
                      length: normalizeInstallmentsCount(
                        boundCheckout.bnplInstallmentsCount
                      ),
                    },
                    (_, index) => ({
                      dueDate: new Date(
                        Date.now() + index * 14 * 24 * 60 * 60 * 1000
                      ).toISOString(),
                      amount: Math.max(
                        0,
                        Math.ceil(
                          boundCheckout.amount /
                            normalizeInstallmentsCount(
                              boundCheckout.bnplInstallmentsCount
                            )
                        )
                      ),
                      status: index === 0 ? "paid" : "due",
                    })
                  ),
                },
                installmentsCount: normalizeInstallmentsCount(
                  boundCheckout.bnplInstallmentsCount
                ),
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

      await this.deps.purchasesRepository.provisionCheckoutAtomic({
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

      await this.syncCapabilityGrantsAfterProvision({
        userId: identity.user.id,
        purchaseId: purchase.id,
        courseId: finalCheckout.courseId,
        teacherId: course.teacherId,
        tariff: purchase.tariff ?? "standard",
        grantedAt: finalCheckout.updatedAt,
      });

      await consumeIdentityIntentAfterProvision({
        checkout: finalCheckout,
        authIdentityIntentService: this.deps.authIdentityIntentService,
        logger: this.deps.logger,
      });

      await this.syncIdentityCompletionAfterProvision(finalCheckout, identity.isNew);

      await this.deps.purchasesRepository.upsertConsentRecords({
        checkoutId: finalCheckout.id,
        email: finalCheckout.email,
        scopes: finalCheckout.consentSnapshot ?? [],
        acceptedAt: finalCheckout.createdAt,
      });

      await appendTimelineEvent(finalCheckout.id, "checkout_provisioned", {
        userId: identity.user.id,
        purchaseId: purchase.id,
        identityState: isIdentityVerified ? "verified" : "unverified",
      });

      if (identity.isNew) {
        await this.deps.notificationsService.enqueueAndDispatch({
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

      await this.deps.notificationsService.enqueueAndDispatch({
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

      await this.deps.notificationsService.enqueueAndDispatch({
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
        await this.deps.notificationsService.enqueueAndDispatch({
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
      await this.deps.purchasesRepository.updateCheckout(failedCheckout);
      await appendTimelineEvent(failedCheckout.id, "provision_failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  }

  private async syncCapabilityGrantsAfterProvision(params: {
    userId: string;
    purchaseId: string;
    courseId: string;
    teacherId?: string | null;
    tariff: "standard" | "premium";
    grantedAt: string;
  }): Promise<void> {
    const repositoryWithCapabilities =
      this.deps.purchasesRepository as unknown as {
        upsertCapabilityGrantsForPurchase?: (payload: {
          userId: string;
          purchaseId: string;
          courseId: string;
          teacherId?: string | null;
          tariff: "standard" | "premium";
          grantedAt: string;
        }) => Promise<void>;
      };
    if (
      typeof repositoryWithCapabilities.upsertCapabilityGrantsForPurchase !==
      "function"
    ) {
      return;
    }

    try {
      await repositoryWithCapabilities.upsertCapabilityGrantsForPurchase({
        userId: params.userId,
        purchaseId: params.purchaseId,
        courseId: params.courseId,
        teacherId: params.teacherId,
        tariff: params.tariff,
        grantedAt: params.grantedAt,
      });
    } catch (error) {
      this.deps.logger.warn(
        `capability grants sync failed for purchase=${params.purchaseId}, user=${params.userId}: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  private async syncIdentityCompletionAfterProvision(
    checkout: CheckoutProcessDto,
    isNewIdentityUser: boolean
  ): Promise<void> {
    if (!checkout.userId) {
      return;
    }
    const identityIntentId = extractIdentityIntentIdFromCheckout(checkout);
    const identityVerifiedHint = !isNewIdentityUser || Boolean(identityIntentId);

    try {
      await this.deps.authService.syncIdentityCompletionAfterPurchase({
        userId: checkout.userId,
        identityVerifiedHint,
        source: identityIntentId
          ? "purchase_finalization_identity_intent"
          : "purchase_finalization",
      });
    } catch (error) {
      if (
        error instanceof TypeError &&
        error.message.includes("syncIdentityCompletionAfterPurchase is not a function")
      ) {
        return;
      }
      this.deps.logger.warn(
        `identity completion sync failed for checkout=${checkout.id}, user=${checkout.userId}: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }
}
