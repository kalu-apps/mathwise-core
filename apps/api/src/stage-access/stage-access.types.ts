import { STAGE_ONLY_REMOVE_BEFORE_PROD } from "../config/runtime.governance";

export type StageAccessStatusDto = {
  enabled: boolean;
  granted: boolean;
  expiresAt: string | null;
  marker: typeof STAGE_ONLY_REMOVE_BEFORE_PROD;
};

export type StageAccessVerifyResponseDto = StageAccessStatusDto & {
  ok: true;
};
