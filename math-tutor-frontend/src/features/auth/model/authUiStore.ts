import { create } from "zustand";

type AuthModalMode = "login" | "recover";
export type AuthModalContext = "general" | "course" | "booking" | "invite";

type AuthUiStore = {
  isAuthModalOpen: boolean;
  authModalMode: AuthModalMode;
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

export const useAuthUiStore = create<AuthUiStore>((set) => ({
  isAuthModalOpen: false,
  authModalMode: "login",
  authModalContext: "general",
  authModalEmail: "",
  authModalError: null,
  openAuthModal: (context = "general") =>
    set({
      isAuthModalOpen: true,
      authModalMode: "login",
      authModalContext: context,
      authModalEmail: "",
      authModalError: null,
    }),
  openAuthModalWithError: (error, email, context = "general") =>
    set({
      isAuthModalOpen: true,
      authModalMode: "login",
      authModalContext: context,
      authModalEmail: email?.trim().toLowerCase() ?? "",
      authModalError: error,
    }),
  openRecoverModal: (email, context = "general") =>
    set({
      isAuthModalOpen: true,
      authModalMode: "recover",
      authModalContext: context,
      authModalEmail: email?.trim().toLowerCase() ?? "",
      authModalError: null,
    }),
  closeAuthModal: () =>
    set({
      isAuthModalOpen: false,
      authModalMode: "login",
      authModalContext: "general",
      authModalEmail: "",
      authModalError: null,
    }),
}));
