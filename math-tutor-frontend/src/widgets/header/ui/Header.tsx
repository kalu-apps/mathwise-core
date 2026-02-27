import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, IconButton, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import CalculateIcon from "@mui/icons-material/Calculate";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import LogoutIcon from "@mui/icons-material/Logout";
import LoginIcon from "@mui/icons-material/Login";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import { useThemeMode } from "@/app/theme/themeModeContext";
import { t } from "@/shared/i18n";

export function Header() {
  const { user, logout, openAuthModal } = useAuth();
  const { mode, toggleMode } = useThemeMode();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isAssistantCompact = useMediaQuery(theme.breakpoints.down("lg"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [assistantState, setAssistantState] = useState<{
    available: boolean;
    uiState: "idle" | "active" | "thinking" | "streaming" | "success" | "warning" | "error";
    isOpen: boolean;
    isLoading: boolean;
    hasError: boolean;
  }>({
    available: false,
    uiState: "idle",
    isOpen: false,
    isLoading: false,
    hasError: false,
  });

  const menuItems = [
    { label: t("header.navCourses"), path: "/courses" },
    { label: t("header.navTeacher"), path: "/about-teacher" },
    { label: t("header.navBooking"), path: "/booking" },
    { label: t("header.navContact"), path: "/contact" },
  ];

  const handleLogoClick = () => {
    if (!window.matchMedia("(max-width: 960px)").matches) {
      navigate("/");
    } else {
      setMobileOpen((prev) => !prev);
    }
  };

  const handleLogout = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    logout();
    navigate("/", { replace: true });
  };

  const showAssistantStatus = Boolean(user);

  const handleAssistantToggle = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("axiom:toggle"));
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleAssistantState = (event: Event) => {
      const detail =
        event instanceof CustomEvent && event.detail && typeof event.detail === "object"
          ? (event.detail as Partial<{
              available: boolean;
              uiState:
                | "idle"
                | "active"
                | "thinking"
                | "streaming"
                | "success"
                | "warning"
                | "error";
              isOpen: boolean;
              isLoading: boolean;
              hasError: boolean;
            }>)
          : null;
      if (!detail) return;
      setAssistantState((current) => ({
        available:
          typeof detail.available === "boolean" ? detail.available : current.available,
        uiState:
          detail.uiState && typeof detail.uiState === "string"
            ? detail.uiState
            : current.uiState,
        isOpen: typeof detail.isOpen === "boolean" ? detail.isOpen : current.isOpen,
        isLoading:
          typeof detail.isLoading === "boolean" ? detail.isLoading : current.isLoading,
        hasError:
          typeof detail.hasError === "boolean" ? detail.hasError : current.hasError,
      }));
    };

    window.addEventListener("axiom:state", handleAssistantState);
    return () => window.removeEventListener("axiom:state", handleAssistantState);
  }, []);

  const assistantStatusLabel = useMemo(() => {
    if (assistantState.hasError || assistantState.uiState === "error") {
      return "Аксиом: ошибка";
    }
    if (assistantState.isLoading || assistantState.uiState === "thinking") {
      return "Аксиом: думаю";
    }
    if (assistantState.uiState === "streaming") {
      return "Аксиом: отвечаю";
    }
    if (assistantState.isOpen || assistantState.uiState === "active") {
      return "Аксиом: онлайн";
    }
    if (assistantState.uiState === "success") {
      return "Аксиом: готово";
    }
    return "Аксиом";
  }, [
    assistantState.hasError,
    assistantState.isLoading,
    assistantState.isOpen,
    assistantState.uiState,
  ]);

  return (
    <header className="header">
      <div className="header__container">
        <div className="header__left">
          <IconButton
            className="header__logo"
            onClick={handleLogoClick}
            size="large"
            aria-expanded={mobileOpen}
            aria-label={t("header.openNavigation")}
          >
            <CalculateIcon
              className={`header__logo-icon ${mobileOpen ? "is-open" : ""}`}
            />
          </IconButton>

          <nav className="header__menu-desktop">
            {menuItems.map((item) => (
              <Button
                key={item.label}
                color="inherit"
                className="header__link"
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </Button>
            ))}
          </nav>
        </div>

        <div className="header__right">
          {showAssistantStatus ? (
            <Tooltip title={t("header.assistant")}>
              <button
                type="button"
                onClick={handleAssistantToggle}
                className={`header__assistant-pill ${
                  assistantState.isLoading || assistantState.uiState === "thinking"
                    ? "is-thinking"
                    : assistantState.hasError || assistantState.uiState === "error"
                      ? "is-error"
                      : assistantState.isOpen
                        ? "is-open"
                        : ""
                } ${isAssistantCompact || isMobile ? "is-compact" : ""}`}
                aria-label={t("header.assistantToggle")}
              >
                <AutoAwesomeRoundedIcon fontSize="small" />
                {!isAssistantCompact && !isMobile ? <span>{assistantStatusLabel}</span> : null}
              </button>
            </Tooltip>
          ) : null}
          <Tooltip
            title={
              mode === "dark"
                ? t("header.switchLightTheme")
                : t("header.switchDarkTheme")
            }
          >
            <IconButton
              onClick={toggleMode}
              size="small"
              aria-label={
                mode === "dark"
                  ? t("header.switchLightTheme")
                  : t("header.switchDarkTheme")
              }
              className="header__theme-toggle"
            >
              {mode === "dark" ? (
                <LightModeRoundedIcon fontSize="small" />
              ) : (
                <DarkModeRoundedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          {user ? (
            <>
              <Tooltip title={t("header.profile")}>
                <Button
                  onClick={() =>
                    navigate(
                      user.role === "student"
                        ? "/student/profile"
                        : "/teacher/profile"
                    )
                  }
                  className="header__profile-btn"
                  color="inherit"
                >
                  <div className="header__avatar">
                    {(user.firstName || user.email)[0]}
                  </div>
                  <span className="header__profile-name">
                    {user.firstName || user.email}
                  </span>
                </Button>
              </Tooltip>

              <Tooltip title={t("header.logout")}>
                <IconButton onClick={handleLogout} size="small">
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Tooltip title={t("header.login")}>
              <IconButton onClick={openAuthModal}>
                <LoginIcon />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="header__mobile-backdrop"
            aria-label={t("header.closeNavigation")}
            onClick={() => setMobileOpen(false)}
          />
          <div className="header__menu-mobile">
            {menuItems.map((item) => (
              <Button
                key={item.label}
                variant="outlined"
                fullWidth
                className="header__mobile-item"
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </>
      )}
    </header>
  );
}
