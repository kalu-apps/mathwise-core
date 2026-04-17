import { createTheme } from "@mui/material/styles";
import type { ThemeMode } from "@/app/theme/themeModeContext";

export function createMuiTheme(mode: ThemeMode) {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? "#7d8eff" : "#4f64dc",
      },
      secondary: {
        main: isDark ? "#49c7df" : "#238fb0",
      },
      success: {
        main: isDark ? "#3fc19c" : "#1f9375",
      },
      warning: {
        main: isDark ? "#e6a84e" : "#b77a1f",
      },
      error: {
        main: isDark ? "#df6f86" : "#bb4960",
      },
      info: {
        main: isDark ? "#57aee8" : "#2a74cb",
      },
      background: {
        default: isDark ? "#0a101f" : "#eff4fb",
        paper: isDark ? "#17223c" : "#ffffff",
      },
      text: {
        primary: isDark ? "#eaf0ff" : "#1f2f4f",
        secondary: isDark ? "#b7c4e6" : "#4b6088",
      },
    },
    shape: {
      borderRadius: 14,
    },
    typography: {
      fontFamily: '"IBM Plex Sans", "Inter", "SF Pro Display", "Segoe UI", -apple-system, sans-serif',
      h1: {
        fontFamily: '"Commissioner", "IBM Plex Sans", "Inter", sans-serif',
        fontWeight: 730,
        letterSpacing: "-0.02em",
        lineHeight: 1.08,
      },
      h2: {
        fontFamily: '"Commissioner", "IBM Plex Sans", "Inter", sans-serif',
        fontWeight: 710,
        letterSpacing: "-0.018em",
        lineHeight: 1.14,
      },
      h3: {
        fontFamily: '"Commissioner", "IBM Plex Sans", "Inter", sans-serif',
        fontWeight: 690,
        letterSpacing: "-0.012em",
        lineHeight: 1.18,
      },
      body1: {
        fontSize: "0.96rem",
        lineHeight: 1.52,
      },
      body2: {
        fontSize: "0.88rem",
        lineHeight: 1.48,
      },
      caption: {
        fontSize: "0.78rem",
        lineHeight: 1.34,
      },
      button: {
        textTransform: "none",
        fontWeight: 650,
        letterSpacing: "0.008em",
      },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            border: "1px solid var(--input-border)",
            boxShadow: "none",
            "& .MuiOutlinedInput-notchedOutline": {
              borderWidth: 0,
              borderColor: "transparent",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderWidth: 0,
              borderColor: "transparent",
            },
            "&.Mui-focused": {
              boxShadow: "none",
              borderColor: "color-mix(in srgb, var(--accent-primary) 30%, var(--input-border))",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderWidth: 0,
              borderColor: "transparent",
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            display: "none",
          },
        },
      },
    },
  });
}
