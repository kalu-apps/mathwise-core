export type RumEventType =
  | "performance"
  | "api_failure"
  | "api_success"
  | "action_guard";

export type RumEventDto = {
  type?: RumEventType;
  at?: string;
  route?: string;
  payload?: unknown;
};

export type RumIngestPayloadDto = {
  events?: RumEventDto[];
};

export type RumIngestResponseDto = {
  ok: true;
  accepted: number;
  dropped: number;
};
