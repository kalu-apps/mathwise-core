export type RetryBackoffPolicy = {
  baseDelayMs: number;
  maxDelayMs: number;
};

const clampPositiveInt = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const clampJitterSeed = (seed: number) => {
  if (!Number.isFinite(seed)) return 0;
  if (seed < 0) return 0;
  if (seed > 1) return 1;
  return seed;
};

export const computeRetryDelayMs = (
  attemptNumber: number,
  policy: RetryBackoffPolicy,
  jitterSeed: number = Math.random()
) => {
  const safeAttempt = Math.max(1, Math.floor(attemptNumber));
  const baseDelay = clampPositiveInt(policy.baseDelayMs);
  const maxDelay = Math.max(baseDelay, clampPositiveInt(policy.maxDelayMs));

  const exponential = baseDelay * Math.pow(2, safeAttempt - 1);
  const cappedBase = Math.min(maxDelay, exponential);

  const jitterRatio = 0.2 + clampJitterSeed(jitterSeed) * 0.4;
  const jitter = Math.floor(cappedBase * jitterRatio);

  return Math.min(maxDelay, cappedBase + jitter);
};
