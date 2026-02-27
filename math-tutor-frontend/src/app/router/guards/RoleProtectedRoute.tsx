import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/model/AuthContext";
import { t } from "@/shared/i18n";
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
  const authModalOpenedForPathRef = useRef<string | null>(null);
  const requestedPath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search]
  );

  useEffect(() => {
    if (isAuthReady && !user && authModalOpenedForPathRef.current !== requestedPath) {
      authModalOpenedForPathRef.current = requestedPath;
      openAuthModal();
    }
    if (user) {
      authModalOpenedForPathRef.current = null;
    }
  }, [isAuthReady, openAuthModal, requestedPath, user]);

  if (!isAuthReady) {
    return <PageLoader minHeight="22vh" title={t("route.checkingSession")} />;
  }

  if (!user) {
    return (
      <Navigate
        to="/"
        replace
        state={{ from: requestedPath, authRequired: true }}
      />
    );
  }

  if (!allow.includes(user.role)) {
    const fallback = user.role === "teacher" ? "/teacher/profile" : "/student/profile";
    return (
      <Navigate
        to={fallback}
        replace
        state={{ accessDeniedFrom: requestedPath }}
      />
    );
  }

  return <>{children}</>;
}
