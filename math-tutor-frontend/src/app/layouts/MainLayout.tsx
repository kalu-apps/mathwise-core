import { Outlet } from "react-router-dom";
import { Header } from "@/widgets/header/ui/Header";
import { AuthModal } from "@/features/auth/ui/AuthModal";
import { useAuth } from "@/features/auth/model/AuthContext";
import { ConnectivityBanner } from "@/shared/ui/ConnectivityBanner";
import { PerformanceModeBanner } from "@/shared/ui/PerformanceModeBanner";

export function MainLayout() {
  const { isAuthModalOpen, closeAuthModal, authModalMode, authModalEmail } =
    useAuth();

  return (
    <>
      <Header />
      <ConnectivityBanner />
      <PerformanceModeBanner />
      <Outlet />
      <AuthModal
        open={isAuthModalOpen}
        onClose={closeAuthModal}
        mode={authModalMode}
        initialEmail={authModalEmail}
      />
    </>
  );
}
