import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, IconButton, Tooltip } from "@mui/material";
import CalculateIcon from "@mui/icons-material/Calculate";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import LogoutIcon from "@mui/icons-material/Logout";
import LoginIcon from "@mui/icons-material/Login";
import { useAuth } from "@/features/auth/model/AuthContext";
import { useThemeMode } from "@/app/theme/themeModeContext";

export function Header() {
  const { user, logout, openAuthModal } = useAuth();
  const { mode, toggleMode } = useThemeMode();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = [
    { label: "Курсы", path: "/courses" },
    { label: "О преподавателе", path: "/about-teacher" },
    { label: "Индивидуальные занятия", path: "/booking" },
    { label: "Задать вопрос", path: "/contact" },
  ];

  const handleLogoClick = () => {
    if (window.innerWidth > 768) {
      navigate("/");
    } else {
      setMobileOpen((prev) => !prev);
    }
  };

  const handleBrandClick = () => {
    setMobileOpen(false);
    navigate("/");
  };

  const handleLogout = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    logout();
    navigate("/", { replace: true });
  };

  return (
    <header className="header">
      <div className="header__container">
        <div className="header__left">
          <button
            type="button"
            className="header__brand"
            onClick={handleBrandClick}
          >
            <span className="header__brand-full">MATH TUTOR</span>
            <span className="header__brand-short">MT</span>
          </button>
          <IconButton
            className="header__logo"
            onClick={handleLogoClick}
            size="large"
            aria-expanded={mobileOpen}
            aria-label="Открыть меню навигации"
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
          <Tooltip
            title={mode === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
          >
            <IconButton
              onClick={toggleMode}
              size="small"
              aria-label={
                mode === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
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
              <Tooltip title="Профиль">
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

              <Tooltip title="Выйти">
                <IconButton onClick={handleLogout} size="small">
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Войти">
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
            aria-label="Закрыть навигацию"
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
