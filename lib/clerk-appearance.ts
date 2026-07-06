import { dark } from "@clerk/themes";

const LIGHT_ACCENT = "oklch(58% 0.135 44)";
const DARK_ACCENT = "oklch(72% 0.135 44)";

export function clerkAppearance(isDark: boolean) {
  return {
    baseTheme: isDark ? dark : undefined,
    variables: {
      colorPrimary: isDark ? DARK_ACCENT : LIGHT_ACCENT,
      fontFamily: "var(--font-karla)",
    },
    elements: {
      card: "shadow-lg rounded-2xl border border-border",
      headerTitle: "font-display italic",
      formButtonPrimary: "normal-case text-sm hover:opacity-90",
      footerActionLink: "font-medium",
    },
  };
}
