import { useLocation, useNavigate } from "react-router-dom";
import { Button, IconButton, Tooltip } from "@mui/material";
import CalculateIcon from "@mui/icons-material/Calculate";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import QuizRoundedIcon from "@mui/icons-material/QuizRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import LogoutIcon from "@mui/icons-material/Logout";
import LoginIcon from "@mui/icons-material/Login";
import { useAuth } from "@/features/auth/model/AuthContext";
import { useThemeMode } from "@/app/theme/themeModeContext";
import { t } from "@/shared/i18n";
import { useAppShellStore } from "@/app/store/appShellStore";
import {
  formatUserBadgeName,
  getUserAvatarInitial,
} from "@/shared/lib/userDisplayName";

export function Header() {
  const { user, logout, openAuthModal } = useAuth();
  const { mode, toggleMode } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();
  const mobileOpen = useAppShellStore((state) => state.mobileMenuOpen);
  const setMobileOpen = useAppShellStore((state) => state.setMobileMenuOpen);

  const menuItems = [
    {
      label: t("header.navCourses"),
      path: "/courses",
      icon: <MenuBookRoundedIcon fontSize="small" />,
    },
    {
      label: t("header.navTeacher"),
      path: "/about-teacher",
      icon: <PersonOutlineRoundedIcon fontSize="small" />,
    },
    {
      label: t("header.navBooking"),
      path: "/booking",
      icon: <EventAvailableRoundedIcon fontSize="small" />,
    },
  ];

  const mobileMenuItems = [
    ...menuItems,
    {
      label: t("header.navContact"),
      path: "/contact",
      icon: <QuizRoundedIcon fontSize="small" />,
    },
  ];

  const handleLogoClick = () => {
    if (!window.matchMedia("(max-width: 960px)").matches) {
      navigate("/");
    } else {
      setMobileOpen((prev) => !prev);
    }
  };

  const handleLogout = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    logout();
    navigate("/", { replace: true });
  };

  const isItemActive = (path: string) => location.pathname.startsWith(path);

  const userDisplayName = user ? formatUserBadgeName(user) : "";
  const userRoleLabel = user?.role === "teacher" ? "Преподаватель" : "Студент";
  const userAvatarInitial = user
    ? (userDisplayName.trim()[0]?.toLocaleUpperCase("ru-RU") ||
      getUserAvatarInitial(user))
    : "";

  return (
    <header className="header">
      <div className="header__container">
        <div className="header__shell">
          <div className="header__brand-anchor">
            <IconButton
              className="header__brand-trigger"
              onClick={handleLogoClick}
              size="large"
              aria-expanded={mobileOpen}
              aria-label={t("header.openNavigation")}
            >
              <CalculateIcon
                className={`header__brand-icon ${mobileOpen ? "is-open" : ""}`}
              />
            </IconButton>
            <div className="header__brand-copy">
              <span className="header__brand-wordmark">Mathwise</span>
              <span className="header__brand-subtle">Learning App</span>
            </div>
          </div>

          <div className="header__nav-rail">
            <nav className="header__tablist" aria-label={t("header.openNavigation")}>
              {menuItems.map((item) => {
                const isActive = isItemActive(item.path);

                return (
                  <Button
                    key={item.label}
                    color="inherit"
                    className={`header__tab ${isActive ? "is-active" : ""}`}
                    onClick={() => navigate(item.path)}
                    startIcon={item.icon}
                    disableRipple
                    disableTouchRipple
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </nav>

            <div className="header__action-bar" role="toolbar">
              <Tooltip title={t("header.navContact")}>
                <IconButton
                  onClick={() => navigate("/contact")}
                  size="small"
                  aria-label={t("header.navContact")}
                  className="header__action-icon"
                  disableRipple
                  disableTouchRipple
                >
                  <QuizRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("header.techSupport")}>
                <IconButton
                  onClick={() => navigate("/contact")}
                  size="small"
                  aria-label={t("header.techSupport")}
                  className="header__action-icon"
                  disableRipple
                  disableTouchRipple
                >
                  <SupportAgentRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
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
                  className="header__action-icon"
                  disableRipple
                  disableTouchRipple
                >
                  {mode === "dark" ? (
                    <LightModeRoundedIcon fontSize="small" />
                  ) : (
                    <DarkModeRoundedIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
            </div>
          </div>

          <div className="header__account-zone">
            {user ? (
              <div className="header__account-control">
                <Tooltip title={t("header.profile")}>
                  <Button
                    onClick={() =>
                      navigate(
                        user.role === "student"
                          ? "/student/profile"
                          : "/teacher/profile"
                      )
                    }
                    className="header__account-main"
                    color="inherit"
                    disableRipple
                    disableTouchRipple
                  >
                    <span className="header__account-avatar">{userAvatarInitial}</span>
                    <span className="header__account-copy">
                      <span className="header__account-name">{userDisplayName}</span>
                      <span className="header__account-role">{userRoleLabel}</span>
                    </span>
                    <ExpandMoreRoundedIcon
                      fontSize="small"
                      className="header__account-chevron"
                    />
                  </Button>
                </Tooltip>

                <Tooltip title={t("header.logout")}>
                  <IconButton
                    onClick={handleLogout}
                    size="small"
                    className="header__account-trailing"
                    disableRipple
                    disableTouchRipple
                  >
                    <LogoutIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            ) : (
              <div className="header__account-control header__account-control--guest">
                <Button
                  className="header__account-login"
                  onClick={() => openAuthModal()}
                  startIcon={<LoginIcon fontSize="small" />}
                  disableRipple
                  disableTouchRipple
                >
                  {t("header.login")}
                </Button>
              </div>
            )}
          </div>
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
            {mobileMenuItems.map((item) => (
              <Button
                key={item.label}
                variant="text"
                fullWidth
                className="header__mobile-item"
                startIcon={item.icon}
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
