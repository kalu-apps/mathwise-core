import { createTheme } from "@mui/material/styles";
import type { ThemeMode } from "@/app/theme/themeModeContext";

export function createMuiTheme(mode: ThemeMode) {
  return createTheme({
    palette: {
      mode,
    },
    shape: {
      borderRadius: 16,
    },
    typography: {
      fontFamily: '"Manrope", "Inter", "SF Pro Display", "Segoe UI", -apple-system, sans-serif',
      button: {
        textTransform: "none",
        fontWeight: 650,
      },
    },
    components: {
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
