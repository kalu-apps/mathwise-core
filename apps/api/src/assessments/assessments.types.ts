export type AssessmentStateRecordDto = {
  templates: unknown[];
  courseContent: Record<string, unknown[]>;
  courseBlocks: Record<string, unknown[]>;
  attempts: Array<Record<string, unknown>>;
};

export type AssessmentSessionsMapDto = Record<string, Record<string, unknown>>;
