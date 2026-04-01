import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { PurchasesService } from "./purchases.service";
import type {
  BnplInstallmentPaymentResponseDto,
  CancelCheckoutResponseDto,
  CheckoutActionResponseDto,
  CheckoutListItemDto,
  CheckoutPayloadDto,
  CheckoutPurchaseResponseDto,
  CheckoutStatusResponseDto,
  CheckoutTimelineResponseDto,
  ProviderWebhookPayloadDto,
  PurchaseRecordDto,
} from "./purchases.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api")
export class PurchasesController {
  constructor(
    private readonly authService: AuthService,
    private readonly purchasesService: PurchasesService
  ) {}

  private async resolveUserFromRequest(
    req: RequestWithCookie,
    res: HttpResponseWithHeaders
  ): Promise<AuthUserDto | null> {
    const sessionId = readSessionIdFromCookieHeader(req.headers?.cookie);
    const user = await this.authService.getSession(sessionId);
    if (!user && sessionId) {
      res.setHeader("Set-Cookie", buildSessionClearCookie());
    }
    return user;
  }

  @Get("purchases")
  async getPurchases(
    @Query("userId") userId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<PurchaseRecordDto[]> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.getPurchases({
      actorUser,
      userId: userId?.trim() || undefined,
    });
  }

  @Put("purchases")
  async savePurchases(
    @Body() body: PurchaseRecordDto[],
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: true }> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    await this.purchasesService.savePurchases(body, actorUser);
    return { ok: true };
  }

  @Delete("purchases")
  async deletePurchasesByCourse(
    @Query("courseId") courseId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: true }> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    await this.purchasesService.deletePurchasesByCourse(courseId?.trim() || "", actorUser);
    return { ok: true };
  }

  @Post("purchases/checkout")
  async checkoutPurchase(
    @Body() body: CheckoutPayloadDto,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CheckoutPurchaseResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.checkoutPurchase({
      payload: body,
      actorUser,
      idempotencyKey,
    });
  }

  @Post("purchases/checkout/attach")
  async attachCheckoutPurchase(
    @Body() body: { checkoutId?: string },
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CheckoutPurchaseResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    const checkoutId = body?.checkoutId?.trim() || "";
    if (!checkoutId) {
      throw new HttpException({ error: "checkoutId обязателен." }, 400);
    }
    return this.purchasesService.attachCheckout({
      checkoutId,
      actorUser,
      idempotencyKey,
    });
  }

  @Post("purchases/:purchaseId/bnpl/pay-installment")
  async payBnplInstallment(
    @Param("purchaseId") purchaseId: string,
    @Body() body: { source?: string } | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<BnplInstallmentPaymentResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.payBnplInstallment({
      purchaseId,
      actorUser,
      source: typeof body?.source === "string" ? body.source : undefined,
    });
  }

  @Post("purchases/:purchaseId/bnpl/pay-remaining")
  async payBnplRemaining(
    @Param("purchaseId") purchaseId: string,
    @Body() body: { source?: string } | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<BnplInstallmentPaymentResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.payBnplRemaining({
      purchaseId,
      actorUser,
      source: typeof body?.source === "string" ? body.source : undefined,
    });
  }

  @Get("checkouts")
  async getCheckouts(
    @Query("userId") userId: string | undefined,
    @Query("email") email: string | undefined,
    @Query("courseId") courseId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CheckoutListItemDto[]> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.getCheckouts({
      actorUser,
      userId: userId?.trim() || undefined,
      email: email?.trim() || undefined,
      courseId: courseId?.trim() || undefined,
    });
  }

  @Get("checkouts/:checkoutId/status")
  async getCheckoutStatus(
    @Param("checkoutId") checkoutId: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CheckoutStatusResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.getCheckoutStatus({
      checkoutId,
      actorUser,
    });
  }

  @Post("checkouts/:checkoutId/retry")
  async retryCheckout(
    @Param("checkoutId") checkoutId: string,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CheckoutActionResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.retryCheckout({
      checkoutId,
      actorUser,
      idempotencyKey,
    });
  }

  @Post("checkouts/:checkoutId/cancel")
  async cancelCheckout(
    @Param("checkoutId") checkoutId: string,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CancelCheckoutResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.cancelCheckout({
      checkoutId,
      actorUser,
      idempotencyKey,
    });
  }

  @Post("checkouts/:checkoutId/stage-confirm")
  async stageConfirmCheckout(
    @Param("checkoutId") checkoutId: string,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CheckoutActionResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.stageConfirmCheckout({
      checkoutId,
      actorUser,
      idempotencyKey,
    });
  }

  @Get("checkouts/:checkoutId/timeline")
  async getCheckoutTimeline(
    @Param("checkoutId") checkoutId: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CheckoutTimelineResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.purchasesService.getCheckoutTimeline({
      checkoutId,
      actorUser,
    });
  }

  @Post("payments/providers/card/webhook")
  async processCardWebhook(
    @Body() payload: ProviderWebhookPayloadDto,
    @Headers("x-card-signature") signature: string | undefined,
    @Headers("x-card-timestamp") timestamp: string | undefined
  ) {
    return this.purchasesService.handleProviderWebhook({
      payload,
      signature: signature?.trim() || "",
      timestamp: timestamp?.trim() || "",
    });
  }

  @Post("payments/providers/card/refund")
  async refundCardCheckout(
    @Body() body: { checkoutId?: string; reason?: string },
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ) {
    const actorUser = await this.resolveUserFromRequest(req, res);
    const checkoutId = body?.checkoutId?.trim() || "";
    if (!checkoutId) {
      throw new HttpException({ error: "checkoutId обязателен." }, 400);
    }
    return this.purchasesService.refundProviderCheckout({
      checkoutId,
      reason: body?.reason,
      actorUser,
    });
  }
}
