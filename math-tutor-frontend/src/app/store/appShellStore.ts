import { create } from "zustand";
import { resolveStoreSetState, type StoreSetStateAction } from "@/shared/lib/storeState";

type AppShellStore = {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (next: StoreSetStateAction<boolean>) => void;
  resetAppShellState: () => void;
};

export const useAppShellStore = create<AppShellStore>((set) => ({
  mobileMenuOpen: false,
  setMobileMenuOpen: (next) =>
    set((state) => ({
      mobileMenuOpen: resolveStoreSetState(state.mobileMenuOpen, next),
    })),
  resetAppShellState: () =>
    set({
      mobileMenuOpen: false,
    }),
}));
