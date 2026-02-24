export type RetryActionEntry = {
  id: string;
  title: string;
  createdAt: string;
  run: () => Promise<unknown>;
};

export type RetryActionSnapshot = {
  id: string;
  title: string;
  createdAt: string;
  pending: boolean;
} | null;

let currentAction: RetryActionEntry | null = null;
let retryPending = false;

const listeners = new Set<() => void>();

const emitChange = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
};

const toSnapshot = (): RetryActionSnapshot => {
  if (!currentAction) return null;
  return {
    id: currentAction.id,
    title: currentAction.title,
    createdAt: currentAction.createdAt,
    pending: retryPending,
  };
};

export const subscribeRetryLastAction = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getRetryLastActionSnapshot = (): RetryActionSnapshot => toSnapshot();

export const setRetryLastAction = (entry: RetryActionEntry) => {
  currentAction = entry;
  retryPending = false;
  emitChange();
};

export const clearRetryLastAction = (id?: string) => {
  if (!currentAction) return;
  if (id && currentAction.id !== id) return;
  currentAction = null;
  retryPending = false;
  emitChange();
};

export const retryLastAction = async () => {
  if (!currentAction) return false;
  if (retryPending) return false;

  const action = currentAction;
  retryPending = true;
  emitChange();

  try {
    await action.run();
    clearRetryLastAction(action.id);
    return true;
  } catch {
    retryPending = false;
    emitChange();
    return false;
  }
};
