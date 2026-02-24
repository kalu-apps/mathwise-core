export type ModerationRequest = {
  text: string;
};

export type ModerationResponse = {
  allowed: boolean;
  reason?: string;
};

export interface ModerationProvider {
  readonly id: string;
  moderate(input: ModerationRequest): Promise<ModerationResponse>;
}
