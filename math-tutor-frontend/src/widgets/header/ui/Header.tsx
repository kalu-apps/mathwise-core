import { useLocation, useNavigate } from "react-router-dom";
import { Button, IconButton, Tooltip } from "@mui/material";
import CalculateIcon from "@mui/icons-material/Calculate";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import LogoutIcon from "@mui/icons-material/Logout";
import LoginIcon from "@mui/icons-material/Login";
import QuizRoundedIcon from "@mui/icons-material/QuizRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";
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

  const handleLogout = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
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
          <div className="header__left">
            <div className="header__brand-anchor">
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
              <span className="header__brand-text">Mathwise</span>
            </div>

            <nav className="header__menu-desktop">
              {menuItems.map((item) => (
                <Button
                  key={item.label}
                  color="inherit"
                  className={`header__link ${isItemActive(item.path) ? "is-active" : ""}`}
                  onClick={() => navigate(item.path)}
                  startIcon={item.icon}
                >
                  {item.label}
                </Button>
              ))}
            </nav>
          </div>

          <div className="header__right">
            <div className="header__utility-cluster">
              <Tooltip title={t("header.navContact")}>
                <IconButton
                  onClick={() => navigate("/contact")}
                  size="small"
                  aria-label={t("header.navContact")}
                  className="header__utility-icon"
                >
                  <QuizRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("header.techSupport")}>
                <IconButton
                  onClick={() => navigate("/contact")}
                  size="small"
                  aria-label={t("header.techSupport")}
                  className="header__utility-icon"
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
                  className="header__utility-icon"
                >
                  {mode === "dark" ? (
                    <LightModeRoundedIcon fontSize="small" />
                  ) : (
                    <DarkModeRoundedIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
            </div>
            {user ? (
              <div className="header__account-cluster">
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
                    <div className="header__avatar">{userAvatarInitial}</div>
                    <span className="header__profile-meta">
                      <span className="header__profile-name">{userDisplayName}</span>
                      <span className="header__profile-role">{userRoleLabel}</span>
                    </span>
                  </Button>
                </Tooltip>

                <Tooltip title={t("header.logout")}>
                  <IconButton
                    onClick={handleLogout}
                    size="small"
                    className="header__account-action"
                  >
                    <LogoutIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            ) : (
              <div className="header__account-cluster header__account-cluster--guest">
                <Button
                  className="header__login-btn"
                  onClick={() => openAuthModal()}
                  startIcon={<LoginIcon fontSize="small" />}
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
                variant="outlined"
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
