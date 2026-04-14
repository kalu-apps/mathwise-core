import type { ApiRuntimeConfig } from "./runtime.config";

// Marker used in stage-gated payloads for diagnostics and observability.
// Keep value stable so clients do not break while cleanup continues.
export const STAGE_RUNTIME_MARKER = "STAGE_ONLY_REMOVE_BEFORE_PROD" as const;

type StageRuntimeSlice = Pick<
  ApiRuntimeConfig,
  "appEnv" | "stageSiteGateEnabled" | "stagePaymentConfirmEnabled"
>;

type BookingRuntimeSlice = Pick<
  ApiRuntimeConfig,
  "bookingV2Enabled" | "bookingV2GuestCompatibilityEnabled"
>;

export const isStageRuntime = (appEnv: ApiRuntimeConfig["appEnv"]): boolean =>
  appEnv === "stage";

export const isStageSiteGateRuntimeEnabled = (
  runtimeConfig: StageRuntimeSlice
): boolean => isStageRuntime(runtimeConfig.appEnv) && runtimeConfig.stageSiteGateEnabled;

export const isStagePaymentConfirmRuntimeEnabled = (
  runtimeConfig: StageRuntimeSlice
): boolean =>
  isStageRuntime(runtimeConfig.appEnv) &&
  runtimeConfig.stagePaymentConfirmEnabled;

export const shouldRequireBookingV2HoldForGuest = (
  runtimeConfig: BookingRuntimeSlice,
  actorUserPresent: boolean
): boolean =>
  runtimeConfig.bookingV2Enabled &&
  !actorUserPresent &&
  !runtimeConfig.bookingV2GuestCompatibilityEnabled;
