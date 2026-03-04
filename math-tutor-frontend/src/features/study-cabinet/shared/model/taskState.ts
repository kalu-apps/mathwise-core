export type CabinetTaskState = {
  dismissed: string[];
  snoozed: Record<string, number>;
};

export const defaultCabinetTaskState: CabinetTaskState = {
  dismissed: [],
  snoozed: {},
};

const isFiniteTimestamp = (value: number) => Number.isFinite(value) && value > 0;

export const normalizeCabinetTaskState = (
  state: CabinetTaskState,
  nowTimestamp = Date.now()
): CabinetTaskState => {
  const dismissed = Array.from(
    new Set(
      state.dismissed
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );

  const snoozed = Object.entries(state.snoozed).reduce<Record<string, number>>(
    (acc, [taskId, until]) => {
      if (!taskId.trim()) return acc;
      if (!isFiniteTimestamp(until)) return acc;
      if (until <= nowTimestamp) return acc;
      acc[taskId] = until;
      return acc;
    },
    {}
  );

  return { dismissed, snoozed };
};

export const dismissCabinetTask = (
  state: CabinetTaskState,
  taskId: string
): CabinetTaskState => {
  const safeTaskId = taskId.trim();
  if (!safeTaskId) return state;
  return {
    dismissed: Array.from(new Set([...state.dismissed, safeTaskId])),
    snoozed: Object.fromEntries(
      Object.entries(state.snoozed).filter(([id]) => id !== safeTaskId)
    ),
  };
};

export const snoozeCabinetTask = (
  state: CabinetTaskState,
  taskId: string,
  untilTimestamp: number
): CabinetTaskState => {
  const safeTaskId = taskId.trim();
  if (!safeTaskId || !isFiniteTimestamp(untilTimestamp)) return state;
  return {
    dismissed: state.dismissed,
    snoozed: {
      ...state.snoozed,
      [safeTaskId]: untilTimestamp,
    },
  };
};

export const unsnoozeCabinetTask = (
  state: CabinetTaskState,
  taskId: string
): CabinetTaskState => {
  const safeTaskId = taskId.trim();
  if (!safeTaskId) return state;
  return {
    dismissed: state.dismissed,
    snoozed: Object.fromEntries(
      Object.entries(state.snoozed).filter(([id]) => id !== safeTaskId)
    ),
  };
};
