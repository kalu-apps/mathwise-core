import type {
  AuthIdentityIntentStartResponseContract,
  AuthIdentityIntentStatusResponseContract,
  AuthIdentityIntentVerifyResponseContract,
  AuthLogoutResponseContract,
  AuthMagicLinkRequestResponseContract,
  AuthOauthWidgetConfigResponseContract,
  AuthSessionProbeResultContract,
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
  AboutTeacherPublicContentResponseContract,
  ProfileMeResponseContract,
  StudentProfileContextResponseContract,
  TeacherInviteAcceptResponseContract,
  TeacherInviteCreateResponseContract,
  TeacherInviteInspectResponseContract,
  TeacherDashboardContextResponseContract,
} from "@/shared/contracts/profile.contract";
import type { Booking } from "@/entities/booking/model/types";
import type { Purchase } from "@/entities/purchase/model/types";
import type {
  BookingSlotHoldStatusResponseContract,
  ConfirmBookingSlotHoldPayloadContract,
  CreateBookingSlotHoldPayloadContract,
  CreateBookingPayloadContract,
  DeleteBookingResponseContract,
  GetBookingsParamsContract,
  UpdateBookingPatchContract,
} from "@/shared/contracts/booking.contract";
import type {
  BnplInstallmentPaymentResponseContract,
  CancelCheckoutResponseContract,
  CheckoutActionResponseContract,
  CheckoutListItemContract,
  CheckoutPayloadContract,
  CheckoutPurchaseResponseContract,
  CheckoutStatusResponseContract,
  CheckoutTimelineResponseContract,
  GetCheckoutsParamsContract,
  GetPurchasesParamsContract,
} from "@/shared/contracts/purchase.contract";

export type GatewayMode = "http";
export type GatewayTransport = "http";

export type GatewayRuntimeConfig = {
  mode: GatewayMode;
  authTransport: GatewayTransport;
  coursesTransport: GatewayTransport;
  lessonsTransport: GatewayTransport;
  accessTransport: GatewayTransport;
  profileTransport: GatewayTransport;
  purchasesTransport: GatewayTransport;
  bookingsTransport: GatewayTransport;
};

export type AuthGateway = {
  requestMagicLink: (
    email: string
  ) => Promise<AuthMagicLinkRequestResponseContract>;
  confirmMagicLink: (params: {
    email: string;
    code: string;
  }) => Promise<AuthSessionResponseContract>;
  passwordLogin: (params: {
    email: string;
    password: string;
  }) => Promise<AuthSessionResponseContract>;
  getSession: () => Promise<AuthSessionResponseContract>;
  logout: () => Promise<AuthLogoutResponseContract>;
  startIdentityIntent: (payload: {
    channel?: "email" | "google" | "yandex" | "vk";
    email?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<AuthIdentityIntentStartResponseContract>;
  verifyIdentityIntent: (payload: {
    intentId: string;
    code: string;
  }) => Promise<AuthIdentityIntentVerifyResponseContract>;
  getIdentityIntentStatus: (
    intentId: string
  ) => Promise<AuthIdentityIntentStatusResponseContract>;
  getOauthWidgetConfig: () => Promise<AuthOauthWidgetConfigResponseContract>;
  probeSession: (signal?: AbortSignal) => Promise<AuthSessionProbeResultContract>;
};

export type CoursesGateway = {
  getCourses: (options?: { forceFresh?: boolean }) => Promise<CourseCatalogResponseContract>;
  getCourseById: (
    id: string,
    options?: { forceFresh?: boolean }
  ) => Promise<CourseByIdResponseContract>;
  getCourseReleaseContent: (
    id: string,
    options?: { forceFresh?: boolean }
  ) => Promise<CourseReleaseContentResponseContract>;
};

export type LessonsGateway = {
  getLessons: (options?: { forceFresh?: boolean }) => Promise<Lesson[]>;
  getLessonById: (
    id: string,
    options?: { forceFresh?: boolean }
  ) => Promise<Lesson | null>;
  getLessonsByCourse: (
    courseId: string,
    options?: { forceFresh?: boolean }
  ) => Promise<Lesson[]>;
  getLessonPlaybackAccess: (params: {
    lessonId: string;
  }) => Promise<LessonPlaybackAccess>;
  getLessonMaterialAccess: (params: {
    lessonId: string;
    materialId: string;
  }) => Promise<LessonMaterialAccess>;
};

export type AccessGateway = {
  getCourseAccessDecision: (params: {
    courseId: string;
  }) => Promise<CourseAccessDecision>;
  getCourseAccessList: () => Promise<CourseAccessListResponse>;
  getLessonAccessDecision: (params: {
    lessonId: string;
  }) => Promise<LessonAccessDecision>;
};

export type ProfileGateway = {
  getProfileMe: () => Promise<ProfileMeResponseContract>;
  getPublicAboutTeacherContent: () => Promise<AboutTeacherPublicContentResponseContract>;
  getStudentProfileContext: () => Promise<StudentProfileContextResponseContract>;
  getTeacherDashboardContext: () => Promise<TeacherDashboardContextResponseContract>;
  createTeacherInvite: (payload: {
    targetEmail?: string;
    note?: string;
  }) => Promise<TeacherInviteCreateResponseContract>;
  inspectTeacherInvite: (token: string) => Promise<TeacherInviteInspectResponseContract>;
  acceptTeacherInvite: (payload: {
    token: string;
    registration?: {
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      password?: string;
    };
  }) => Promise<TeacherInviteAcceptResponseContract>;
};

export type PurchasesGateway = {
  getPurchases: (
    params?: GetPurchasesParamsContract,
    options?: { forceFresh?: boolean }
  ) => Promise<Purchase[]>;
  savePurchases: (purchases: Purchase[]) => Promise<void>;
  deletePurchasesByCourse: (courseId: string) => Promise<void>;
  checkoutPurchase: (
    payload: CheckoutPayloadContract,
    options?: { idempotencyKey?: string }
  ) => Promise<CheckoutPurchaseResponseContract>;
  attachCheckoutPurchase: (
    checkoutId: string,
    options?: { idempotencyKey?: string }
  ) => Promise<CheckoutPurchaseResponseContract>;
  payBnplInstallment: (
    purchaseId: string,
    payload?: { source?: string }
  ) => Promise<BnplInstallmentPaymentResponseContract>;
  payBnplRemaining: (
    purchaseId: string,
    payload?: { source?: string }
  ) => Promise<BnplInstallmentPaymentResponseContract>;
  cancelCheckout: (checkoutId: string) => Promise<CancelCheckoutResponseContract>;
  getCheckoutStatus: (checkoutId: string) => Promise<CheckoutStatusResponseContract>;
  retryCheckout: (checkoutId: string) => Promise<CheckoutActionResponseContract>;
  stageConfirmCheckout: (
    checkoutId: string,
    options?: { idempotencyKey?: string }
  ) => Promise<CheckoutActionResponseContract>;
  getCheckoutTimeline: (
    checkoutId: string
  ) => Promise<CheckoutTimelineResponseContract>;
  getCheckouts: (params?: GetCheckoutsParamsContract) => Promise<CheckoutListItemContract[]>;
};

export type BookingsGateway = {
  getBookings: (params?: GetBookingsParamsContract) => Promise<Booking[]>;
  createBooking: (
    payload: CreateBookingPayloadContract,
    options?: { idempotencyKey?: string }
  ) => Promise<Booking>;
  createBookingSlotHold: (
    payload: CreateBookingSlotHoldPayloadContract,
    options?: { idempotencyKey?: string }
  ) => Promise<BookingSlotHoldStatusResponseContract>;
  getBookingSlotHoldStatus: (
    holdId: string
  ) => Promise<BookingSlotHoldStatusResponseContract>;
  confirmBookingSlotHold: (
    holdId: string,
    payload?: ConfirmBookingSlotHoldPayloadContract,
    options?: { idempotencyKey?: string }
  ) => Promise<Booking>;
  updateBooking: (id: string, patch: UpdateBookingPatchContract) => Promise<Booking>;
  deleteBooking: (id: string) => Promise<DeleteBookingResponseContract>;
  rescheduleBooking: (id: string, slotId: string) => Promise<Booking>;
};
