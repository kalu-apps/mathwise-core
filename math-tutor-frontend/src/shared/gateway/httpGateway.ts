import { ApiError, api } from "@/shared/api/client";
import type {
  AuthIdentityIntentStartResponseContract,
  AuthIdentityIntentStatusResponseContract,
  AuthIdentityIntentVerifyResponseContract,
  AuthLogoutResponseContract,
  AuthMagicLinkRequestResponseContract,
  AuthSessionResponseContract,
} from "@/shared/contracts/auth.contract";
import type {
  CourseReleaseContentResponseContract,
  CourseByIdResponseContract,
  CourseCatalogResponseContract,
} from "@/shared/contracts/course.contract";
import type {
  Lesson,
  LessonMaterialAccess,
  LessonPlaybackAccess,
} from "@/entities/lesson/model/types";
import type {
  CourseAccessDecision,
  CourseAccessListResponse,
  LessonAccessDecision,
} from "@/domain/auth-payments/model/access";
import type {
  AccessGateway,
  AuthGateway,
  BookingsGateway,
  CoursesGateway,
  LessonsGateway,
  PurchasesGateway,
  ProfileGateway,
} from "./types";
import type {
  AboutTeacherPublicContentResponseContract,
  HomeHeroAssetResponseContract,
  ProfileMeResponseContract,
  StudentProfileContextResponseContract,
  TeacherInviteAcceptResponseContract,
  TeacherInviteCreateResponseContract,
  TeacherInviteInspectResponseContract,
  TeacherDashboardContextResponseContract,
} from "@/shared/contracts/profile.contract";
import type { Booking } from "@/entities/booking/model/types";
import type { Purchase } from "@/entities/purchase/model/types";
import { buildIdempotencyHeaders } from "@/shared/lib/idempotency";
import type {
  BookingSlotHoldStatusResponseContract,
  ConfirmBookingSlotHoldPayloadContract,
  CreateBookingSlotHoldPayloadContract,
  DeleteBookingResponseContract,
} from "@/shared/contracts/booking.contract";
import type {
  BnplInstallmentPaymentResponseContract,
  CancelCheckoutResponseContract,
  CheckoutActionResponseContract,
  CheckoutListItemContract,
  CheckoutPurchaseResponseContract,
  CheckoutStatusResponseContract,
  CheckoutTimelineResponseContract,
} from "@/shared/contracts/purchase.contract";

const readNodeEnv = (name: string) => {
  if (typeof process === "undefined") return undefined;
  return process.env?.[name];
};

const getHttpApiBase = () => {
  const raw =
    import.meta.env.VITE_API_BASE_URL?.trim() ??
    readNodeEnv("API_BASE_URL")?.trim();
  if (!raw) return "/api";
  const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  if (normalized === "/api" || normalized.endsWith("/api")) {
    return normalized;
  }
  if (normalized.includes("/api/")) {
    return normalized;
  }
  return `${normalized}/api`;
};

export const resolveHttpApiBase = () => getHttpApiBase();

const buildHttpApiUrl = (path: string) => `${getHttpApiBase()}${path}`;

const isDefaultApiBase = () => getHttpApiBase() === "/api";

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const requestHttpJson = async <T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  }
): Promise<T> => {
  const headers: Record<string, string> = {
    ...(options?.headers ?? {}),
  };
  if (options?.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(buildHttpApiUrl(path), {
    method: options?.method ?? "GET",
    credentials: "include",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `HTTP ${response.status}`;
    throw new ApiError(
      message,
      response.status,
      payload,
      "unknown",
      undefined,
      response.status >= 500
    );
  }
  return payload as T;
};

const buildQuerySuffix = (query: URLSearchParams) => {
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
};

const probeAuthSession = async (signal?: AbortSignal) => {
  const response = await fetch(buildHttpApiUrl("/auth/session"), {
    method: "GET",
    credentials: "include",
    signal,
  });
  return { status: response.status };
};

export const httpGateway: AuthGateway = {
  async requestMagicLink(
    email: string
  ): Promise<AuthMagicLinkRequestResponseContract> {
    return requestHttpJson<AuthMagicLinkRequestResponseContract>("/auth/magic-link", {
      method: "POST",
      body: { email },
    });
  },
  async confirmMagicLink(params): Promise<AuthSessionResponseContract> {
    return requestHttpJson<AuthSessionResponseContract>("/auth/magic-link/confirm", {
      method: "POST",
      body: params,
    });
  },
  async passwordLogin(params): Promise<AuthSessionResponseContract> {
    return requestHttpJson<AuthSessionResponseContract>("/auth/password/login", {
      method: "POST",
      body: params,
    });
  },
  async getSession(): Promise<AuthSessionResponseContract> {
    return requestHttpJson<AuthSessionResponseContract>("/auth/session");
  },
  async logout(): Promise<AuthLogoutResponseContract> {
    return requestHttpJson<AuthLogoutResponseContract>("/auth/logout", {
      method: "POST",
      body: {},
    });
  },
  async startIdentityIntent(
    payload
  ): Promise<AuthIdentityIntentStartResponseContract> {
    return requestHttpJson<AuthIdentityIntentStartResponseContract>(
      "/auth/identity-intents/start",
      {
        method: "POST",
        body: payload ?? {},
      }
    );
  },
  async verifyIdentityIntent(
    payload
  ): Promise<AuthIdentityIntentVerifyResponseContract> {
    return requestHttpJson<AuthIdentityIntentVerifyResponseContract>(
      "/auth/identity-intents/verify",
      {
        method: "POST",
        body: payload,
      }
    );
  },
  async getIdentityIntentStatus(
    intentId
  ): Promise<AuthIdentityIntentStatusResponseContract> {
    return requestHttpJson<AuthIdentityIntentStatusResponseContract>(
      `/auth/identity-intents/${encodeURIComponent(intentId)}/status`
    );
  },
  probeSession: probeAuthSession,
};

export const httpCoursesGateway: CoursesGateway = {
  async getCourses(options): Promise<CourseCatalogResponseContract> {
    if (isDefaultApiBase()) {
      return api.get<CourseCatalogResponseContract>("/courses", {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    return requestHttpJson<CourseCatalogResponseContract>("/courses");
  },
  async getCourseById(id, options): Promise<CourseByIdResponseContract> {
    if (isDefaultApiBase()) {
      return api.get<CourseByIdResponseContract>(`/courses/${id}`, {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    const encodedId = encodeURIComponent(id);
    return requestHttpJson<CourseByIdResponseContract>(`/courses/${encodedId}`);
  },
  async getCourseReleaseContent(
    id,
    options
  ): Promise<CourseReleaseContentResponseContract> {
    const encodedId = encodeURIComponent(id);
    if (isDefaultApiBase()) {
      return api.get<CourseReleaseContentResponseContract>(
        `/courses/${encodedId}/release-content`,
        {
          dedupe: options?.forceFresh ? false : undefined,
          cacheTtlMs: options?.forceFresh ? 0 : undefined,
        }
      );
    }
    return requestHttpJson<CourseReleaseContentResponseContract>(
      `/courses/${encodedId}/release-content`
    );
  },
};

export const httpLessonsGateway: LessonsGateway = {
  async getLessons(options): Promise<Lesson[]> {
    if (isDefaultApiBase()) {
      return api.get<Lesson[]>("/lessons", {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    return requestHttpJson<Lesson[]>("/lessons");
  },
  async getLessonById(id, options): Promise<Lesson | null> {
    if (isDefaultApiBase()) {
      return api.get<Lesson | null>(`/lessons/${id}`, {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    return requestHttpJson<Lesson | null>(`/lessons/${encodeURIComponent(id)}`);
  },
  async getLessonsByCourse(courseId, options): Promise<Lesson[]> {
    const encodedCourseId = encodeURIComponent(courseId);
    if (isDefaultApiBase()) {
      return api.get<Lesson[]>(`/lessons?courseId=${encodedCourseId}`, {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    return requestHttpJson<Lesson[]>(`/courses/${encodedCourseId}/lessons`);
  },
  async getLessonPlaybackAccess(params): Promise<LessonPlaybackAccess> {
    const encodedLessonId = encodeURIComponent(params.lessonId);
    if (isDefaultApiBase()) {
      return api.get<LessonPlaybackAccess>(`/lessons/${encodedLessonId}/playback`, {
        dedupe: false,
        cacheTtlMs: 0,
      });
    }
    return requestHttpJson<LessonPlaybackAccess>(
      `/lessons/${encodedLessonId}/playback`
    );
  },
  async getLessonMaterialAccess(params): Promise<LessonMaterialAccess> {
    const encodedLessonId = encodeURIComponent(params.lessonId);
    const encodedMaterialId = encodeURIComponent(params.materialId);
    if (isDefaultApiBase()) {
      return api.get<LessonMaterialAccess>(
        `/lessons/${encodedLessonId}/materials/${encodedMaterialId}/access`,
        {
          dedupe: false,
          cacheTtlMs: 0,
        }
      );
    }
    return requestHttpJson<LessonMaterialAccess>(
      `/lessons/${encodedLessonId}/materials/${encodedMaterialId}/access`
    );
  },
};

export const httpAccessGateway: AccessGateway = {
  async getCourseAccessDecision(params): Promise<CourseAccessDecision> {
    const suffix = "";
    if (isDefaultApiBase()) {
      return api.get<CourseAccessDecision>(
        `/access/courses/${encodeURIComponent(params.courseId)}${suffix}`
      );
    }
    return requestHttpJson<CourseAccessDecision>(
      `/access/courses/${encodeURIComponent(params.courseId)}${suffix}`
    );
  },
  async getCourseAccessList(): Promise<CourseAccessListResponse> {
    const suffix = "";
    if (isDefaultApiBase()) {
      return api.get<CourseAccessListResponse>(`/access/courses${suffix}`);
    }
    return requestHttpJson<CourseAccessListResponse>(`/access/courses${suffix}`);
  },
  async getLessonAccessDecision(params): Promise<LessonAccessDecision> {
    const suffix = "";
    if (isDefaultApiBase()) {
      return api.get<LessonAccessDecision>(
        `/access/lessons/${encodeURIComponent(params.lessonId)}${suffix}`
      );
    }
    return requestHttpJson<LessonAccessDecision>(
      `/access/lessons/${encodeURIComponent(params.lessonId)}${suffix}`
    );
  },
};

export const httpProfileGateway: ProfileGateway = {
  async getProfileMe(): Promise<ProfileMeResponseContract> {
    return requestHttpJson<ProfileMeResponseContract>("/profile/me");
  },
  async getPublicAboutTeacherContent(): Promise<AboutTeacherPublicContentResponseContract> {
    return requestHttpJson<AboutTeacherPublicContentResponseContract>(
      "/public/about-teacher/content"
    );
  },
  async getPublicHomeHeroAsset(): Promise<HomeHeroAssetResponseContract> {
    return requestHttpJson<HomeHeroAssetResponseContract>("/public/home/hero-asset");
  },
  async getStudentProfileContext(): Promise<StudentProfileContextResponseContract> {
    return requestHttpJson<StudentProfileContextResponseContract>("/student/context");
  },
  async getTeacherDashboardContext(): Promise<TeacherDashboardContextResponseContract> {
    return requestHttpJson<TeacherDashboardContextResponseContract>("/teacher/context");
  },
  async createTeacherInvite(payload): Promise<TeacherInviteCreateResponseContract> {
    return requestHttpJson<TeacherInviteCreateResponseContract>("/teacher/invites", {
      method: "POST",
      body: payload ?? {},
    });
  },
  async inspectTeacherInvite(token): Promise<TeacherInviteInspectResponseContract> {
    return requestHttpJson<TeacherInviteInspectResponseContract>(
      `/teacher/invites/inspect?token=${encodeURIComponent(token)}`
    );
  },
  async acceptTeacherInvite(payload): Promise<TeacherInviteAcceptResponseContract> {
    return requestHttpJson<TeacherInviteAcceptResponseContract>("/teacher/invites/accept", {
      method: "POST",
      body: payload,
    });
  },
};

export const httpPurchasesGateway: PurchasesGateway = {
  async getPurchases(params, options): Promise<Purchase[]> {
    const query = new URLSearchParams();
    if (params?.userId) query.set("userId", params.userId);
    const suffix = buildQuerySuffix(query);
    if (isDefaultApiBase()) {
      return api.get<Purchase[]>(`/purchases${suffix}`, {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    return requestHttpJson<Purchase[]>(`/purchases${suffix}`);
  },
  async savePurchases(purchases): Promise<void> {
    await requestHttpJson<void>("/purchases", {
      method: "PUT",
      body: purchases,
    });
  },
  async deletePurchasesByCourse(courseId): Promise<void> {
    await requestHttpJson<void>(
      `/purchases?courseId=${encodeURIComponent(courseId)}`,
      { method: "DELETE" }
    );
  },
  async checkoutPurchase(payload, options): Promise<CheckoutPurchaseResponseContract> {
    return requestHttpJson<CheckoutPurchaseResponseContract>("/purchases/checkout", {
      method: "POST",
      body: payload,
      headers: buildIdempotencyHeaders("checkout", options?.idempotencyKey),
    });
  },
  async attachCheckoutPurchase(
    checkoutId,
    options
  ): Promise<CheckoutPurchaseResponseContract> {
    return requestHttpJson<CheckoutPurchaseResponseContract>(
      "/purchases/checkout/attach",
      {
        method: "POST",
        body: { checkoutId },
        headers: buildIdempotencyHeaders(
          "checkout_attach",
          options?.idempotencyKey
        ),
      }
    );
  },
  async payBnplInstallment(
    purchaseId,
    payload
  ): Promise<BnplInstallmentPaymentResponseContract> {
    return requestHttpJson<BnplInstallmentPaymentResponseContract>(
      `/purchases/${encodeURIComponent(purchaseId)}/bnpl/pay-installment`,
      {
        method: "POST",
        body: payload ?? {},
      }
    );
  },
  async payBnplRemaining(
    purchaseId,
    payload
  ): Promise<BnplInstallmentPaymentResponseContract> {
    return requestHttpJson<BnplInstallmentPaymentResponseContract>(
      `/purchases/${encodeURIComponent(purchaseId)}/bnpl/pay-remaining`,
      {
        method: "POST",
        body: payload ?? {},
      }
    );
  },
  async cancelCheckout(checkoutId): Promise<CancelCheckoutResponseContract> {
    return requestHttpJson<CancelCheckoutResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/cancel`,
      {
        method: "POST",
        body: {},
        headers: buildIdempotencyHeaders("checkout_cancel"),
      }
    );
  },
  async getCheckoutStatus(
    checkoutId
  ): Promise<CheckoutStatusResponseContract> {
    return requestHttpJson<CheckoutStatusResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/status`
    );
  },
  async retryCheckout(checkoutId): Promise<CheckoutActionResponseContract> {
    return requestHttpJson<CheckoutActionResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/retry`,
      {
        method: "POST",
        body: {},
        headers: buildIdempotencyHeaders("checkout_retry"),
      }
    );
  },
  async stageConfirmCheckout(
    checkoutId,
    options
  ): Promise<CheckoutActionResponseContract> {
    return requestHttpJson<CheckoutActionResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/stage-confirm`,
      {
        method: "POST",
        body: {},
        headers: buildIdempotencyHeaders(
          "checkout_stage_confirm",
          options?.idempotencyKey
        ),
      }
    );
  },
  async getCheckoutTimeline(
    checkoutId
  ): Promise<CheckoutTimelineResponseContract> {
    return requestHttpJson<CheckoutTimelineResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/timeline`
    );
  },
  async getCheckouts(params): Promise<CheckoutListItemContract[]> {
    const query = new URLSearchParams();
    if (params?.userId) query.set("userId", params.userId);
    if (params?.email) query.set("email", params.email);
    if (params?.courseId) query.set("courseId", params.courseId);
    const suffix = buildQuerySuffix(query);
    return requestHttpJson<CheckoutListItemContract[]>(`/checkouts${suffix}`);
  },
};

export const httpBookingsGateway: BookingsGateway = {
  async getBookings(params): Promise<Booking[]> {
    const query = new URLSearchParams();
    if (params?.teacherId) query.set("teacherId", params.teacherId);
    if (params?.studentId) query.set("studentId", params.studentId);
    const suffix = buildQuerySuffix(query);
    return api.get<Booking[]>(`/bookings${suffix}`);
  },
  async createBooking(payload, options): Promise<Booking> {
    return api.post<Booking>("/bookings", payload, {
      headers: buildIdempotencyHeaders("booking", options?.idempotencyKey),
    });
  },
  async createBookingSlotHold(
    payload: CreateBookingSlotHoldPayloadContract,
    options
  ): Promise<BookingSlotHoldStatusResponseContract> {
    return api.post<BookingSlotHoldStatusResponseContract>(
      "/bookings/holds",
      payload,
      {
        headers: buildIdempotencyHeaders("booking_hold", options?.idempotencyKey),
      }
    );
  },
  async getBookingSlotHoldStatus(
    holdId: string
  ): Promise<BookingSlotHoldStatusResponseContract> {
    return api.get<BookingSlotHoldStatusResponseContract>(
      `/bookings/holds/${encodeURIComponent(holdId)}`
    );
  },
  async confirmBookingSlotHold(
    holdId: string,
    payload?: ConfirmBookingSlotHoldPayloadContract,
    options?: { idempotencyKey?: string }
  ): Promise<Booking> {
    return api.post<Booking>(
      `/bookings/holds/${encodeURIComponent(holdId)}/confirm`,
      payload ?? {},
      {
        headers: buildIdempotencyHeaders(
          "booking_hold_confirm",
          options?.idempotencyKey
        ),
      }
    );
  },
  async updateBooking(id, patch): Promise<Booking> {
    return api.put<Booking>(`/bookings/${encodeURIComponent(id)}`, patch, {
      headers: buildIdempotencyHeaders("booking_update"),
    });
  },
  async deleteBooking(id): Promise<DeleteBookingResponseContract> {
    return api.del<DeleteBookingResponseContract>(
      `/bookings/${encodeURIComponent(id)}`,
      {
        headers: buildIdempotencyHeaders("booking_delete"),
      }
    );
  },
  async rescheduleBooking(id, slotId): Promise<Booking> {
    return api.put<Booking>(
      `/bookings/${encodeURIComponent(id)}`,
      { reschedule: { slotId } },
      {
        headers: buildIdempotencyHeaders("booking_reschedule"),
      }
    );
  },
};
