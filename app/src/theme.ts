// Parla — dark, energetic, Swift/Zwift-inspired design tokens
export const theme = {
  colors: {
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
  },
  radius: { sm: 10, md: 16, lg: 22, pill: 999 },
  space: (n: number) => n * 4,
} as const;

export type Theme = typeof theme;
