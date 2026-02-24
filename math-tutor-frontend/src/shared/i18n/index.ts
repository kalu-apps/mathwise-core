import { ru } from "./ru";

type Primitive = string | number | boolean | null | undefined;
interface MessageTree {
  [key: string]: string | MessageTree;
}

type Join<K, P> = K extends string
  ? P extends string
    ? `${K}.${P}`
    : never
  : never;

type LeafKeys<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends string
        ? K
        : T[K] extends object
          ? Join<K, LeafKeys<T[K]>>
          : never;
    }[keyof T & string]
  : never;

export type TranslationKey = LeafKeys<typeof ru>;

const messages = {
  ru,
} as const;

let currentLocale: keyof typeof messages = "ru";

const getByPath = (obj: MessageTree, path: string) =>
  path.split(".").reduce<string | MessageTree | undefined>((acc, part) => {
    if (!acc || typeof acc === "string") return undefined;
    return acc[part];
  }, obj);

const interpolate = (
  template: string,
  params?: Record<string, Primitive>
) => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = params[token];
    return value === null || value === undefined ? "" : String(value);
  });
};

export const setLocale = (locale: keyof typeof messages) => {
  currentLocale = locale;
};

export const t = (key: TranslationKey, params?: Record<string, Primitive>) => {
  const source = messages[currentLocale] as unknown as MessageTree;
  const value = getByPath(source, key);
  if (typeof value !== "string") {
    return key;
  }
  return interpolate(value, params);
};

export const i18n = {
  t,
  setLocale,
};
