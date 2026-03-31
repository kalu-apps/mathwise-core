import {
  httpAccessGateway,
  httpCoursesGateway,
  httpGateway,
  httpLessonsGateway,
} from "./httpGateway";
import {
  mockAccessGateway,
  mockCoursesGateway,
  mockGateway,
  mockLessonsGateway,
} from "./mockGateway";
import type {
  AccessGateway,
  AuthGateway,
  CoursesGateway,
  GatewayTransport,
  LessonsGateway,
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
