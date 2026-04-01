import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
import { BookingsService } from "./bookings.service";
import type {
  BookingDto,
  CreateBookingPayloadDto,
  UpdateBookingPatchDto,
} from "./bookings.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api")
export class BookingsController {
  constructor(
    private readonly authService: AuthService,
    private readonly bookingsService: BookingsService
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

  @Get("bookings")
  async getBookings(
    @Query("teacherId") teacherId: string | undefined,
    @Query("studentId") studentId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<BookingDto[]> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.bookingsService.getBookings({
      actorUser,
      teacherId: teacherId?.trim() || undefined,
      studentId: studentId?.trim() || undefined,
    });
  }

  @Post("bookings")
  async createBooking(
    @Body() body: CreateBookingPayloadDto,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<BookingDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.bookingsService.createBooking({
      payload: body,
      actorUser,
      idempotencyKey,
    });
  }

  @Get("teachers/:teacherId/availability")
  async getTeacherAvailability(
    @Param("teacherId") teacherId: string
  ): Promise<Array<{ id: string; date: string; startTime: string; endTime: string }>> {
    return this.bookingsService.getPublicTeacherAvailability(teacherId);
  }

  @Get("availability/me")
  async getMyAvailability(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<Array<{ id: string; date: string; startTime: string; endTime: string }>> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.bookingsService.getMyTeacherAvailability(actorUser);
  }

  @Put("availability/me")
  async replaceMyAvailability(
    @Body()
    body:
      | Array<{ id?: string; date: string; startTime: string; endTime: string }>
      | { slots?: Array<{ id?: string; date: string; startTime: string; endTime: string }> },
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<Array<{ id: string; date: string; startTime: string; endTime: string }>> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    const slots = Array.isArray(body) ? body : body?.slots ?? [];
    return this.bookingsService.replaceTeacherAvailability({
      actorUser,
      slots,
    });
  }

  @Put("bookings/:id")
  async updateBooking(
    @Param("id") id: string,
    @Body() patch: UpdateBookingPatchDto,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<BookingDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.bookingsService.updateBooking({
      bookingId: id,
      patch,
      actorUser,
      idempotencyKey,
    });
  }

  @Delete("bookings/:id")
  async deleteBooking(
    @Param("id") id: string,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ id: string }> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.bookingsService.deleteBooking({
      bookingId: id,
      actorUser,
      idempotencyKey,
    });
  }
}
