import { create } from "zustand";

type AuthModalMode = "login" | "recover";

type AuthUiStore = {
  isAuthModalOpen: boolean;
  authModalMode: AuthModalMode;
  authModalEmail: string;
  authModalError: string | null;
  openAuthModal: () => void;
  openAuthModalWithError: (error: string, email?: string) => void;
  openRecoverModal: (email?: string) => void;
  closeAuthModal: () => void;
};

export const useAuthUiStore = create<AuthUiStore>((set) => ({
  isAuthModalOpen: false,
  authModalMode: "login",
  authModalEmail: "",
  authModalError: null,
  openAuthModal: () =>
    set({
      isAuthModalOpen: true,
      authModalMode: "login",
      authModalEmail: "",
      authModalError: null,
    }),
  openAuthModalWithError: (error, email) =>
    set({
      isAuthModalOpen: true,
      authModalMode: "login",
      authModalEmail: email?.trim().toLowerCase() ?? "",
      authModalError: error,
    }),
  openRecoverModal: (email) =>
    set({
      isAuthModalOpen: true,
      authModalMode: "recover",
      authModalEmail: email?.trim().toLowerCase() ?? "",
      authModalError: null,
    }),
  closeAuthModal: () =>
    set({
      isAuthModalOpen: false,
      authModalMode: "login",
      authModalEmail: "",
      authModalError: null,
    }),
}));
