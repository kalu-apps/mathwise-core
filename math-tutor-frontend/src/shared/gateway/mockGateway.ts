import { api } from "@/shared/api/client";
import type {
  AuthLogoutResponseContract,
  AuthMagicLinkRequestResponseContract,
  AuthSessionResponseContract,
} from "@/shared/contracts/auth.contract";
import type {
  CourseByIdResponseContract,
  CourseCatalogResponseContract,
} from "@/shared/contracts/course.contract";
import type { Lesson } from "@/entities/lesson/model/types";
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
  ProfileMeResponseContract,
  StudentProfileContextResponseContract,
  TeacherDashboardContextResponseContract,
} from "@/shared/contracts/profile.contract";
import type { User } from "@/entities/user/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { Booking } from "@/entities/booking/model/types";
import type { Purchase } from "@/entities/purchase/model/types";
import { buildIdempotencyHeaders } from "@/shared/lib/idempotency";
import type {
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

const getTeacherAvailabilityById = async (teacherId: string) => {
  return api.get<AvailabilitySlot[]>(`/teacher-availability/${teacherId}`);
};

const probeAuthSession = async (signal?: AbortSignal) => {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    signal,
  });
  return { status: response.status };
};

export const mockGateway: AuthGateway = {
  async requestMagicLink(
    email: string
  ): Promise<AuthMagicLinkRequestResponseContract> {
    return api.post<AuthMagicLinkRequestResponseContract>(
      "/auth/magic-link",
      { email },
      { notifyDataUpdate: false }
    );
  },
  async confirmMagicLink(params): Promise<AuthSessionResponseContract> {
    return api.post<AuthSessionResponseContract>(
      "/auth/magic-link/confirm",
      params,
      { notifyDataUpdate: false }
    );
  },
  async passwordLogin(params): Promise<AuthSessionResponseContract> {
    return api.post<AuthSessionResponseContract>(
      "/auth/password/login",
      params,
      { notifyDataUpdate: false }
    );
  },
  async getSession(): Promise<AuthSessionResponseContract> {
    return api.get<AuthSessionResponseContract>("/auth/session");
  },
  async logout(): Promise<AuthLogoutResponseContract> {
    return api.post<AuthLogoutResponseContract>(
      "/auth/logout",
      {},
      { notifyDataUpdate: false }
    );
  },
  probeSession: probeAuthSession,
};

export const mockCoursesGateway: CoursesGateway = {
  async getCourses(options): Promise<CourseCatalogResponseContract> {
    return api.get<CourseCatalogResponseContract>("/courses", {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
  async getCourseById(id, options): Promise<CourseByIdResponseContract> {
    return api.get<CourseByIdResponseContract>(`/courses/${id}`, {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
};

export const mockLessonsGateway: LessonsGateway = {
  async getLessons(options): Promise<Lesson[]> {
    return api.get<Lesson[]>("/lessons", {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
  async getLessonById(id, options): Promise<Lesson | null> {
    return api.get<Lesson | null>(`/lessons/${id}`, {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
  async getLessonsByCourse(courseId, options): Promise<Lesson[]> {
    return api.get<Lesson[]>(`/lessons?courseId=${encodeURIComponent(courseId)}`, {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
};

export const mockAccessGateway: AccessGateway = {
  async getCourseAccessDecision(params): Promise<CourseAccessDecision> {
    const query = new URLSearchParams();
    if (params.userId) {
      query.set("userId", params.userId);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<CourseAccessDecision>(
      `/access/courses/${encodeURIComponent(params.courseId)}${suffix}`
    );
  },
  async getCourseAccessList(params): Promise<CourseAccessListResponse> {
    const query = new URLSearchParams();
    if (params?.userId) {
      query.set("userId", params.userId);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<CourseAccessListResponse>(`/access/courses${suffix}`);
  },
  async getLessonAccessDecision(params): Promise<LessonAccessDecision> {
    const query = new URLSearchParams();
    if (params.userId) {
      query.set("userId", params.userId);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<LessonAccessDecision>(
      `/access/lessons/${encodeURIComponent(params.lessonId)}${suffix}`
    );
  },
};

export const mockProfileGateway: ProfileGateway = {
  async getProfileMe(): Promise<ProfileMeResponseContract> {
    return api.get<ProfileMeResponseContract>("/auth/session");
  },
  async getStudentProfileContext(): Promise<StudentProfileContextResponseContract> {
    const profile = await api.get<User | null>("/auth/session");
    if (!profile || profile.role !== "student") {
      return {
        profile,
        courses: [],
        lessons: [],
        purchases: [],
        bookings: [],
        teachers: [],
        teacherAvailabilityByTeacherId: {},
      };
    }

    const [courses, lessons, purchases, bookings, teachers] = await Promise.all([
      api.get<StudentProfileContextResponseContract["courses"]>("/courses"),
      api.get<StudentProfileContextResponseContract["lessons"]>("/lessons"),
      api.get<Purchase[]>(`/purchases?userId=${encodeURIComponent(profile.id)}`),
      api.get<Booking[]>(`/bookings?studentId=${encodeURIComponent(profile.id)}`),
      api.get<User[]>("/users?role=teacher"),
    ]);

    const availabilityPairs = await Promise.all(
      teachers.map(async (teacher) => {
        const slots = await getTeacherAvailabilityById(teacher.id);
        return [teacher.id, slots] as const;
      })
    );
    const teacherAvailabilityByTeacherId = Object.fromEntries(availabilityPairs);

    return {
      profile,
      courses,
      lessons,
      purchases,
      bookings,
      teachers,
      teacherAvailabilityByTeacherId,
    };
  },
  async getTeacherDashboardContext(): Promise<TeacherDashboardContextResponseContract> {
    const profile = await api.get<User | null>("/auth/session");
    if (!profile || profile.role !== "teacher") {
      return {
        profile,
        courses: [],
        lessons: [],
        students: [],
        bookings: [],
        availability: [],
      };
    }

    const [courses, lessons, students, bookings, availability] = await Promise.all([
      api.get<TeacherDashboardContextResponseContract["courses"]>("/courses"),
      api.get<TeacherDashboardContextResponseContract["lessons"]>("/lessons"),
      api.get<User[]>("/users?role=student"),
      api.get<Booking[]>(`/bookings?teacherId=${encodeURIComponent(profile.id)}`),
      getTeacherAvailabilityById(profile.id),
    ]);

    const teacherCourses = courses.filter((course) => course.teacherId === profile.id);
    const teacherCourseIdSet = new Set(teacherCourses.map((course) => course.id));

    return {
      profile,
      courses: teacherCourses,
      lessons: lessons.filter((lesson) => teacherCourseIdSet.has(lesson.courseId)),
      students,
      bookings,
      availability,
    };
  },
};

export const mockPurchasesGateway: PurchasesGateway = {
  async getPurchases(params, options): Promise<Purchase[]> {
    const query = new URLSearchParams();
    if (params?.userId) {
      query.set("userId", params.userId);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<Purchase[]>(`/purchases${suffix}`, {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
  async savePurchases(purchases): Promise<void> {
    await api.put("/purchases", purchases);
  },
  async deletePurchasesByCourse(courseId): Promise<void> {
    await api.del(`/purchases?courseId=${encodeURIComponent(courseId)}`);
  },
  async checkoutPurchase(payload, options): Promise<CheckoutPurchaseResponseContract> {
    return api.post<CheckoutPurchaseResponseContract>("/purchases/checkout", payload, {
      headers: buildIdempotencyHeaders("checkout", options?.idempotencyKey),
    });
  },
  async attachCheckoutPurchase(
    checkoutId,
    options
  ): Promise<CheckoutPurchaseResponseContract> {
    return api.post<CheckoutPurchaseResponseContract>(
      "/purchases/checkout/attach",
      { checkoutId },
      {
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
    return api.post<BnplInstallmentPaymentResponseContract>(
      `/purchases/${encodeURIComponent(purchaseId)}/bnpl/pay-installment`,
      payload ?? {}
    );
  },
  async payBnplRemaining(
    purchaseId,
    payload
  ): Promise<BnplInstallmentPaymentResponseContract> {
    return api.post<BnplInstallmentPaymentResponseContract>(
      `/purchases/${encodeURIComponent(purchaseId)}/bnpl/pay-remaining`,
      payload ?? {}
    );
  },
  async cancelCheckout(checkoutId): Promise<CancelCheckoutResponseContract> {
    return api.post<CancelCheckoutResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/cancel`,
      {},
      {
        headers: buildIdempotencyHeaders("checkout_cancel"),
      }
    );
  },
  async getCheckoutStatus(
    checkoutId
  ): Promise<CheckoutStatusResponseContract> {
    return api.get<CheckoutStatusResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/status`
    );
  },
  async retryCheckout(checkoutId): Promise<CheckoutActionResponseContract> {
    return api.post<CheckoutActionResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/retry`,
      {},
      {
        headers: buildIdempotencyHeaders("checkout_retry"),
      }
    );
  },
  async confirmCheckoutPaid(
    checkoutId
  ): Promise<CheckoutActionResponseContract> {
    return api.post<CheckoutActionResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/confirm-paid`,
      {},
      {
        headers: buildIdempotencyHeaders("checkout_confirm"),
      }
    );
  },
  async getCheckoutTimeline(
    checkoutId
  ): Promise<CheckoutTimelineResponseContract> {
    return api.get<CheckoutTimelineResponseContract>(
      `/checkouts/${encodeURIComponent(checkoutId)}/timeline`
    );
  },
  async getCheckouts(params): Promise<CheckoutListItemContract[]> {
    const query = new URLSearchParams();
    if (params?.userId) query.set("userId", params.userId);
    if (params?.email) query.set("email", params.email);
    if (params?.courseId) query.set("courseId", params.courseId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<CheckoutListItemContract[]>(`/checkouts${suffix}`);
  },
};

export const mockBookingsGateway: BookingsGateway = {
  async getBookings(params): Promise<Booking[]> {
    const query = new URLSearchParams();
    if (params?.teacherId) query.set("teacherId", params.teacherId);
    if (params?.studentId) query.set("studentId", params.studentId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<Booking[]>(`/bookings${suffix}`);
  },
  async createBooking(payload, options): Promise<Booking> {
    return api.post<Booking>("/bookings", payload, {
      headers: buildIdempotencyHeaders("booking", options?.idempotencyKey),
    });
  },
  async updateBooking(id, patch): Promise<Booking> {
    return api.put<Booking>(`/bookings/${id}`, patch, {
      headers: buildIdempotencyHeaders("booking_update"),
    });
  },
  async deleteBooking(id): Promise<DeleteBookingResponseContract> {
    return api.del<DeleteBookingResponseContract>(`/bookings/${id}`, {
      headers: buildIdempotencyHeaders("booking_delete"),
    });
  },
  async rescheduleBooking(id, slotId): Promise<Booking> {
    return api.put<Booking>(
      `/bookings/${id}`,
      { reschedule: { slotId } },
      {
        headers: buildIdempotencyHeaders("booking_reschedule"),
      }
    );
  },
};
