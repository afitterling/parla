import { createContext, useContext, useMemo } from 'react';
import { Theme, ThemeMode, themeFor } from './theme';

// Mirrors the I18nContext pattern: the parent resolves the concrete Theme from
// the persisted setting + OS scheme, and provides it here. Components read it
// via `useTheme()` for render-side colors and `useStyles(makeStyles)` for
// themed StyleSheets (memoized so they only rebuild when the theme changes).
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme/useStyles must be used inside a ThemeProvider');
  return ctx;
}

export function useStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}

export type ThemeSetting = 'light' | 'dark' | 'system';

// 'system' follows the OS scheme; anything else is taken literally. Defaults to
// dark when the OS scheme is unknown.
export function resolveThemeMode(
  setting: ThemeSetting,
  systemScheme: string | null | undefined
): ThemeMode {
  if (setting === 'light' || setting === 'dark') return setting;
  return systemScheme === 'light' ? 'light' : 'dark';
}

export { themeFor };
