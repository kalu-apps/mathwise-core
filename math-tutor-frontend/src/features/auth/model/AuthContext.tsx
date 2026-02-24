import { createContext, useContext } from "react";
import type { User } from "@/entities/user/model/types";

type AuthContextType = {
  user: User | null;
  isAuthReady: boolean;
  requestLoginCode: (
    email: string
  ) => Promise<{ ok: boolean; error?: string; message?: string; debugCode?: string | null }>;
  confirmLoginCode: (
    email: string,
    code: string
  ) => Promise<{ ok: boolean; error?: string }>;
  loginWithPassword: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; code?: string; lockedUntil?: string | null }>;
  updateUser: (nextUser: User) => void;
  logout: () => void;
  isAuthModalOpen: boolean;
  authModalMode: "login" | "recover";
  authModalEmail: string;
  openAuthModal: () => void;
  openRecoverModal: (email?: string) => void;
  closeAuthModal: () => void;
};

export const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType
);

export const useAuth = () => useContext(AuthContext);
