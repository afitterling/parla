// Parla — dark, energetic design tokens (shared look with the mobile app)
export const theme = {
  colors: {
    bg: '#0B0B0F',
    bgElevated: '#16161D',
    card: '#1C1C26',
    cardBorder: '#2A2A38',
    text: '#F5F5F7',
    textMuted: '#9A9AAB',
    textFaint: '#6A6A7C',
    accent: '#FF5C00',
    accentDim: '#FF5C0022',
    accent2: '#22D3EE',
    accent2Dim: '#22D3EE22',
    success: '#34D399',
    danger: '#FF4D6D',
  },
  radius: { sm: 10, md: 16, lg: 22, pill: 999 },
} as const;

export type Theme = typeof theme;
