import type { User } from "@/entities/user/model/types";

export type AuthSessionResponseContract = User | null;

export type AuthLogoutResponseContract = {
  ok: boolean;
};

export type AuthMagicLinkRequestResponseContract = {
  ok: boolean;
  message: string;
  expiresAt?: string | null;
  debugCode?: string | null;
};

export type AuthSessionProbeResultContract = {
  status: number;
};
