// Parla — theme resolution. The actual color values live as CSS custom
// properties in index.css (`:root` = dark, `:root[data-theme="light"]` = light),
// so components style via classNames and icons inherit `currentColor`. This
// module only resolves which mode is active and applies it to <html>.
export type ThemeMode = 'light' | 'dark';
export type ThemeSetting = 'light' | 'dark' | 'system';

// 'system' follows the OS scheme; anything else is taken literally. Defaults to
// dark when the OS scheme is unknown.
export function resolveThemeMode(setting: ThemeSetting, systemPrefersDark: boolean): ThemeMode {
  if (setting === 'light' || setting === 'dark') return setting;
  return systemPrefersDark ? 'dark' : 'light';
}

// Apply the resolved mode to the document root so the CSS variables switch.
export function applyThemeMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}
