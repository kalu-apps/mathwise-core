import { STAGE_RUNTIME_MARKER } from "../config/runtime.governance";

export type StageAccessStatusDto = {
  enabled: boolean;
  granted: boolean;
  expiresAt: string | null;
  marker: typeof STAGE_RUNTIME_MARKER;
};

export type StageAccessVerifyResponseDto = StageAccessStatusDto & {
  ok: true;
};
