import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/model/AuthContext";
import { PageLoader } from "@/shared/ui/loading";

export function RoleProtectedRoute({
  allow,
  children,
}: {
  allow: ("student" | "teacher")[];
  children: ReactNode;
}) {
  const { user, openAuthModal, isAuthReady } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (isAuthReady && !user) {
      openAuthModal();
    }
  }, [isAuthReady, user, openAuthModal]);

  if (!isAuthReady) {
    return <PageLoader minHeight="22vh" title="Проверяем сессию..." />;
  }

  if (!user) {
    return (
      <Navigate
        to="/"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (!allow.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
