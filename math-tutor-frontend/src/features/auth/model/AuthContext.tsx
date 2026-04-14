import { createContext, useContext } from "react";
import type { User } from "@/entities/user/model/types";
import type { AuthModalContext } from "./authUiStore";

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
  authModalContext: AuthModalContext;
  authModalEmail: string;
  authModalError: string | null;
  openAuthModal: (context?: AuthModalContext) => void;
  openAuthModalWithError: (
    error: string,
    email?: string,
    context?: AuthModalContext
  ) => void;
  openRecoverModal: (email?: string, context?: AuthModalContext) => void;
  closeAuthModal: () => void;
};

export const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType
);

export const useAuth = () => useContext(AuthContext);
