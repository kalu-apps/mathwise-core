import { create } from "zustand";

type AuthModalMode = "login" | "recover";

type AuthUiStore = {
  isAuthModalOpen: boolean;
  authModalMode: AuthModalMode;
  authModalEmail: string;
  openAuthModal: () => void;
  openRecoverModal: (email?: string) => void;
  closeAuthModal: () => void;
};

export const useAuthUiStore = create<AuthUiStore>((set) => ({
  isAuthModalOpen: false,
  authModalMode: "login",
  authModalEmail: "",
  openAuthModal: () =>
    set({
      isAuthModalOpen: true,
      authModalMode: "login",
      authModalEmail: "",
    }),
  openRecoverModal: (email) =>
    set({
      isAuthModalOpen: true,
      authModalMode: "recover",
      authModalEmail: email?.trim().toLowerCase() ?? "",
    }),
  closeAuthModal: () =>
    set({
      isAuthModalOpen: false,
      authModalMode: "login",
      authModalEmail: "",
    }),
}));
