import type { ApiRuntimeConfig } from "./runtime.config";

export const STAGE_ONLY_REMOVE_BEFORE_PROD = "STAGE_ONLY_REMOVE_BEFORE_PROD" as const;

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
