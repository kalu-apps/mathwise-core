export type StoreSetStateAction<T> = T | ((prev: T) => T);

export const resolveStoreSetState = <T>(
  current: T,
  next: StoreSetStateAction<T>
): T => {
  if (typeof next === "function") {
    return (next as (prev: T) => T)(current);
  }
  return next;
};
