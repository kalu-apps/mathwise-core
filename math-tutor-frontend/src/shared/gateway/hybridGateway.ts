import {
  httpAccessGateway,
  httpBookingsGateway,
  httpCoursesGateway,
  httpGateway,
  httpLessonsGateway,
  httpProfileGateway,
  httpPurchasesGateway,
} from "./httpGateway";
import {
  mockAccessGateway,
  mockBookingsGateway,
  mockCoursesGateway,
  mockGateway,
  mockLessonsGateway,
  mockProfileGateway,
  mockPurchasesGateway,
} from "./mockGateway";
import type {
  AccessGateway,
  AuthGateway,
  BookingsGateway,
  CoursesGateway,
  GatewayTransport,
  LessonsGateway,
  ProfileGateway,
  PurchasesGateway,
} from "./types";

const resolveGatewayByTransport = (transport: GatewayTransport): AuthGateway => {
  return transport === "mock" ? mockGateway : httpGateway;
};

const resolveCoursesGatewayByTransport = (
  transport: GatewayTransport
): CoursesGateway => {
  return transport === "mock" ? mockCoursesGateway : httpCoursesGateway;
};

const resolveLessonsGatewayByTransport = (
  transport: GatewayTransport
): LessonsGateway => {
  return transport === "mock" ? mockLessonsGateway : httpLessonsGateway;
};

const resolveAccessGatewayByTransport = (
  transport: GatewayTransport
): AccessGateway => {
  return transport === "mock" ? mockAccessGateway : httpAccessGateway;
};

const resolveProfileGatewayByTransport = (
  transport: GatewayTransport
): ProfileGateway => {
  return transport === "mock" ? mockProfileGateway : httpProfileGateway;
};

const resolvePurchasesGatewayByTransport = (
  transport: GatewayTransport
): PurchasesGateway => {
  return transport === "mock" ? mockPurchasesGateway : httpPurchasesGateway;
};

const resolveBookingsGatewayByTransport = (
  transport: GatewayTransport
): BookingsGateway => {
  return transport === "mock" ? mockBookingsGateway : httpBookingsGateway;
};

export const createHybridAuthGateway = (
  resolveAuthTransport: () => GatewayTransport
): AuthGateway => {
  return {
    requestMagicLink(email: string) {
      return resolveGatewayByTransport(resolveAuthTransport()).requestMagicLink(email);
    },
    confirmMagicLink(params) {
      return resolveGatewayByTransport(resolveAuthTransport()).confirmMagicLink(params);
    },
    passwordLogin(params) {
      return resolveGatewayByTransport(resolveAuthTransport()).passwordLogin(params);
    },
    getSession() {
      return resolveGatewayByTransport(resolveAuthTransport()).getSession();
    },
    logout() {
      return resolveGatewayByTransport(resolveAuthTransport()).logout();
    },
    probeSession(signal?: AbortSignal) {
      return resolveGatewayByTransport(resolveAuthTransport()).probeSession(signal);
    },
  };
};

export const createHybridCoursesGateway = (
  resolveCoursesTransport: () => GatewayTransport
): CoursesGateway => {
  return {
    getCourses(options) {
      return resolveCoursesGatewayByTransport(resolveCoursesTransport()).getCourses(
        options
      );
    },
    getCourseById(id, options) {
      return resolveCoursesGatewayByTransport(
        resolveCoursesTransport()
      ).getCourseById(id, options);
    },
  };
};

export const createHybridLessonsGateway = (
  resolveLessonsTransport: () => GatewayTransport
): LessonsGateway => {
  return {
    getLessons(options) {
      return resolveLessonsGatewayByTransport(resolveLessonsTransport()).getLessons(
        options
      );
    },
    getLessonById(id, options) {
      return resolveLessonsGatewayByTransport(
        resolveLessonsTransport()
      ).getLessonById(id, options);
    },
    getLessonsByCourse(courseId, options) {
      return resolveLessonsGatewayByTransport(
        resolveLessonsTransport()
      ).getLessonsByCourse(courseId, options);
    },
  };
};

export const createHybridAccessGateway = (
  resolveAccessTransport: () => GatewayTransport
): AccessGateway => {
  return {
    getCourseAccessDecision(params) {
      return resolveAccessGatewayByTransport(
        resolveAccessTransport()
      ).getCourseAccessDecision(params);
    },
    getCourseAccessList(params) {
      return resolveAccessGatewayByTransport(
        resolveAccessTransport()
      ).getCourseAccessList(params);
    },
    getLessonAccessDecision(params) {
      return resolveAccessGatewayByTransport(
        resolveAccessTransport()
      ).getLessonAccessDecision(params);
    },
  };
};

export const createHybridProfileGateway = (
  resolveProfileTransport: () => GatewayTransport
): ProfileGateway => {
  return {
    getProfileMe() {
      return resolveProfileGatewayByTransport(
        resolveProfileTransport()
      ).getProfileMe();
    },
    getStudentProfileContext() {
      return resolveProfileGatewayByTransport(
        resolveProfileTransport()
      ).getStudentProfileContext();
    },
    getTeacherDashboardContext() {
      return resolveProfileGatewayByTransport(
        resolveProfileTransport()
      ).getTeacherDashboardContext();
    },
  };
};

export const createHybridPurchasesGateway = (
  resolvePurchasesTransport: () => GatewayTransport
): PurchasesGateway => {
  return {
    getPurchases(params, options) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).getPurchases(params, options);
    },
    savePurchases(purchases) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).savePurchases(purchases);
    },
    deletePurchasesByCourse(courseId) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).deletePurchasesByCourse(courseId);
    },
    checkoutPurchase(payload, options) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).checkoutPurchase(payload, options);
    },
    attachCheckoutPurchase(checkoutId, options) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).attachCheckoutPurchase(checkoutId, options);
    },
    payBnplInstallment(purchaseId, payload) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).payBnplInstallment(purchaseId, payload);
    },
    payBnplRemaining(purchaseId, payload) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).payBnplRemaining(purchaseId, payload);
    },
    cancelCheckout(checkoutId) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).cancelCheckout(checkoutId);
    },
    getCheckoutStatus(checkoutId) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).getCheckoutStatus(checkoutId);
    },
    retryCheckout(checkoutId) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).retryCheckout(checkoutId);
    },
    confirmCheckoutPaid(checkoutId) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).confirmCheckoutPaid(checkoutId);
    },
    getCheckoutTimeline(checkoutId) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).getCheckoutTimeline(checkoutId);
    },
    getCheckouts(params) {
      return resolvePurchasesGatewayByTransport(
        resolvePurchasesTransport()
      ).getCheckouts(params);
    },
  };
};

export const createHybridBookingsGateway = (
  resolveBookingsTransport: () => GatewayTransport
): BookingsGateway => {
  return {
    getBookings(params) {
      return resolveBookingsGatewayByTransport(
        resolveBookingsTransport()
      ).getBookings(params);
    },
    createBooking(payload, options) {
      return resolveBookingsGatewayByTransport(
        resolveBookingsTransport()
      ).createBooking(payload, options);
    },
    updateBooking(id, patch) {
      return resolveBookingsGatewayByTransport(
        resolveBookingsTransport()
      ).updateBooking(id, patch);
    },
    deleteBooking(id) {
      return resolveBookingsGatewayByTransport(
        resolveBookingsTransport()
      ).deleteBooking(id);
    },
    rescheduleBooking(id, slotId) {
      return resolveBookingsGatewayByTransport(
        resolveBookingsTransport()
      ).rescheduleBooking(id, slotId);
    },
  };
};
