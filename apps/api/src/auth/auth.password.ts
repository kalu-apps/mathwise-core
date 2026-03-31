import crypto from "node:crypto";

const HASH_PREFIX = "scrypt-v1";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

const normalizePassword = (rawPassword: string) => rawPassword.normalize("NFKC");

export const hashPassword = (rawPassword: string, pepper: string) => {
  const password = normalizePassword(rawPassword);
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(`${password}:${pepper}`, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `${HASH_PREFIX}$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${key.toString("hex")}`;
};

export const verifyPassword = (
  rawPassword: string,
  storedHash: string | null | undefined,
  pepper: string
) => {
  if (!storedHash) return false;
  const [prefix, nRaw, rRaw, pRaw, saltHex, digestHex] = storedHash.split("$");
  if (
    prefix !== HASH_PREFIX ||
    !nRaw ||
    !rRaw ||
    !pRaw ||
    !saltHex ||
    !digestHex
  ) {
    return false;
  }
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(digestHex, "hex");
    const password = normalizePassword(rawPassword);
    const derived = crypto.scryptSync(`${password}:${pepper}`, salt, expected.length, {
      N,
      r,
      p,
    });
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
};
