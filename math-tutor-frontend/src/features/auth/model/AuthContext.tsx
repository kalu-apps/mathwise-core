import { createContext, useContext } from "react";
import type { User } from "@/entities/user/model/types";

type AuthContextType = {
  user: User | null;
  isAuthReady: boolean;
  loginWithPassword: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; code?: string; lockedUntil?: string | null }>;
  updateUser: (nextUser: User) => void;
  logout: () => void;
  isAuthModalOpen: boolean;
  authModalMode: "login" | "recover";
  authModalEmail: string;
  authModalError: string | null;
  openAuthModal: () => void;
  openAuthModalWithError: (error: string, email?: string) => void;
  openRecoverModal: (email?: string) => void;
  closeAuthModal: () => void;
};

export const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType
);

export const useAuth = () => useContext(AuthContext);
