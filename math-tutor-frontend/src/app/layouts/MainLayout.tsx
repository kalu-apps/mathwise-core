import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Header } from "@/widgets/header/ui/Header";
import { AuthModal } from "@/features/auth/ui/AuthModal";
import { useAuth } from "@/features/auth/model/AuthContext";
import { ConnectivityBanner } from "@/shared/ui/ConnectivityBanner";
import { PerformanceModeBanner } from "@/shared/ui/PerformanceModeBanner";
import { AxiomAssistant } from "@/features/assistant/ui/AxiomAssistant";
import type { AssistantMode } from "@/shared/api/assistant-contracts";

const resolveAssistantMode = (pathname: string): AssistantMode => {
  if (pathname.startsWith("/workbook/session/")) return "whiteboard";
  if (pathname.startsWith("/lessons/")) return "lesson";
  if (pathname.startsWith("/courses/")) return "course";
  if (pathname.startsWith("/teacher/profile")) return "teacher-dashboard";
  if (pathname.startsWith("/student/profile")) return "study-cabinet";
  return "study-cabinet";
};

export function MainLayout() {
  const { user, isAuthReady, isAuthModalOpen, closeAuthModal, authModalMode, authModalEmail } =
    useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthReady || !user) return;
    if (location.pathname !== "/") return;
    const state = location.state as { from?: string; authRequired?: boolean } | null;
    const from = typeof state?.from === "string" ? state.from.trim() : "";
    if (!from || !from.startsWith("/") || from.startsWith("//") || from === "/") return;
    navigate(from, { replace: true, state: null });
  }, [isAuthReady, location.pathname, location.state, navigate, user]);

  return (
    <>
      <Header />
      <ConnectivityBanner />
      <PerformanceModeBanner />
      <main className="app-main">
        <Outlet />
      </main>
      {user && (user.role === "student" || user.role === "teacher") ? (
        <AxiomAssistant
          userId={user.id}
          role={user.role}
          mode={resolveAssistantMode(location.pathname)}
        />
      ) : null}
      <AuthModal
        open={isAuthModalOpen}
        onClose={closeAuthModal}
        mode={authModalMode}
        initialEmail={authModalEmail}
      />
    </>
  );
}
