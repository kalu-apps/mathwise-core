export type StageAccessStatusDto = {
  enabled: boolean;
  granted: boolean;
  expiresAt: string | null;
  marker: "STAGE_ONLY_REMOVE_BEFORE_PROD";
};

export type StageAccessVerifyResponseDto = StageAccessStatusDto & {
  ok: true;
};

