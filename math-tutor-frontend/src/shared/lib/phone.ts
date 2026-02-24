export const PHONE_MASK_TEMPLATE = "+7 (___) ___-__-__";

export const normalizeRuPhoneDigits = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  let normalized = digits;
  if (normalized.startsWith("8")) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (!normalized.startsWith("7")) {
    normalized = `7${normalized}`;
  }

  return normalized.slice(0, 11);
};

export const isRuPhoneComplete = (value: string) =>
  normalizeRuPhoneDigits(value).length === 11;

export const formatRuPhoneInput = (value: string) => {
  const digits = normalizeRuPhoneDigits(value);
  const local = digits.startsWith("7") ? digits.slice(1) : digits;
  const padded = local.padEnd(10, "_").slice(0, 10);

  return `+7 (${padded.slice(0, 3)}) ${padded.slice(3, 6)}-${padded.slice(6, 8)}-${padded.slice(8, 10)}`;
};

export const toRuPhoneStorage = (value: string) => {
  const digits = normalizeRuPhoneDigits(value);
  if (digits.length !== 11) return "";
  return `+${digits}`;
};

export const formatRuPhoneDisplay = (value?: string | null) => {
  if (!value) return "";
  const digits = normalizeRuPhoneDigits(value);
  if (digits.length !== 11) return "";

  const local = digits.slice(1);
  return `+7 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 8)}-${local.slice(8, 10)}`;
};
