import { api } from "@/shared/api/client";
import type { UserCapabilityProjection } from "./types";

export async function getMyCapabilities(
  options?: { forceFresh?: boolean }
): Promise<UserCapabilityProjection> {
  return api.get<UserCapabilityProjection>("/capabilities/me", {
    dedupe: options?.forceFresh ? false : undefined,
    cacheTtlMs: options?.forceFresh ? 0 : 1_500,
  });
}
