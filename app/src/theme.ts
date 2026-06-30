// Parla — design tokens. Two palettes (dark + light) sharing the same keys, so
// any `theme.colors.X` reference works under either mode. `radius` and `space`
// are appearance-independent. The accent hues stay close across modes so that
// the fixed on-accent foregrounds (white on orange, dark teal on cyan) remain
// legible in both.
export type Colors = {
  bg: string;
  bgElevated: string;
  card: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentDim: string;
  accent2: string;
  accent2Dim: string;
  success: string;
  danger: string;
  user: string;
  ai: string;
};

const dark: Colors = {
  bg: '#0B0B0F',
  bgElevated: '#16161D',
  card: '#1C1C26',
  cardBorder: '#2A2A38',
  text: '#F5F5F7',
  textMuted: '#9A9AAB',
  textFaint: '#6A6A7C',
  accent: '#FF5C00', // electric orange
  accentDim: '#FF5C0022',
  accent2: '#22D3EE', // cyan
  accent2Dim: '#22D3EE22',
  success: '#34D399',
  danger: '#FF4D6D',
  user: '#22D3EE',
  ai: '#FF5C00',
};

const light: Colors = {
  bg: '#F6F6FA',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: '#E4E4ED',
  text: '#16161D',
  textMuted: '#5C5C6E',
  textFaint: '#9A9AAB',
  accent: '#E85400', // slightly deepened orange for contrast on white
  accentDim: '#FF5C001A',
  accent2: '#0891B2', // deepened cyan so it reads as text on light surfaces
  accent2Dim: '#0891B21F',
  success: '#059669',
  danger: '#E11D48',
  user: '#0891B2',
  ai: '#E85400',
};

const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
const space = (n: number) => n * 4;

export type ThemeMode = 'light' | 'dark';
export type Theme = { colors: Colors; radius: typeof radius; space: typeof space };

const themes: Record<ThemeMode, Theme> = {
  dark: { colors: dark, radius, space },
  light: { colors: light, radius, space },
};

export function themeFor(mode: ThemeMode): Theme {
  return themes[mode];
}

// Default singleton (dark) kept as a fallback for any non-reactive usage.
export const theme: Theme = themes.dark;
