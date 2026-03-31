import type { User } from "@/entities/user/model/types";

export type AuthSessionResponseContract = User | null;

export type AuthLogoutResponseContract = {
  ok: boolean;
};

export type AuthSessionProbeResultContract = {
  status: number;
};
