import { httpCoursesGateway, httpGateway } from "./httpGateway";
import { mockCoursesGateway, mockGateway } from "./mockGateway";
import type { AuthGateway, CoursesGateway, GatewayTransport } from "./types";

const resolveGatewayByTransport = (transport: GatewayTransport): AuthGateway => {
  return transport === "mock" ? mockGateway : httpGateway;
};

const resolveCoursesGatewayByTransport = (
  transport: GatewayTransport
): CoursesGateway => {
  return transport === "mock" ? mockCoursesGateway : httpCoursesGateway;
};

export const createHybridAuthGateway = (
  resolveAuthTransport: () => GatewayTransport
): AuthGateway => {
  return {
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
