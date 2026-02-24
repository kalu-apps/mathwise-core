type ClassInput =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean>
  | ClassInput[];

const toClass = (value: ClassInput): string => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(toClass).filter(Boolean).join(" ");
  }
  return Object.entries(value)
    .filter(([, active]) => active)
    .map(([name]) => name)
    .join(" ");
};

export const cn = (...values: ClassInput[]) =>
  values.map(toClass).filter(Boolean).join(" ");
