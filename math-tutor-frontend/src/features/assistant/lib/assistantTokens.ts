export const assistantTokens = {
  brand: {
    violet500: "#7A5CFF",
    violet600: "#6A4EFF",
    violet300: "#A89BFF",
    cyan400: "#46C2FF",
    success: "#22C55E",
    warning: "#F59E0B",
    error: "#EF4444",
  },
  radius: {
    xs: 8,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    pill: 999,
  },
  shadow: {
    dark1: "0 8px 26px rgba(0,0,0,0.35)",
    dark2: "0 18px 50px rgba(0,0,0,0.45)",
    dark3: "0 24px 70px rgba(0,0,0,0.55)",
    light1: "0 6px 18px rgba(11,18,32,0.08)",
    light2: "0 18px 50px rgba(11,18,32,0.12)",
    light3: "0 24px 70px rgba(11,18,32,0.16)",
  },
  blur: {
    glass: "12px",
    soft: "8px",
  },
  spacing: [4, 8, 12, 16, 20, 24, 32],
} as const;

export const assistantCssVars = {
  "--assistant-violet": assistantTokens.brand.violet500,
  "--assistant-violet-hover": assistantTokens.brand.violet600,
  "--assistant-violet-soft": assistantTokens.brand.violet300,
  "--assistant-cyan": assistantTokens.brand.cyan400,
  "--assistant-success": assistantTokens.brand.success,
  "--assistant-warning": assistantTokens.brand.warning,
  "--assistant-error": assistantTokens.brand.error,
} as const;
