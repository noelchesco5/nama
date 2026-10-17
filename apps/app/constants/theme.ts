// Design tokens from the UX specification. No emoji. 4dp spacing grid.

export const colors = {
  deepGreen: '#0B6B57',
  teal: '#168C80',
  softWhite: '#F7FAF8',
  mint: '#E8F3EF',
  charcoal: '#20312D',
  border: '#D3E6DF',
  danger: '#B3261E',
  warning: '#8A6100',
  onDark: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const fonts = {
  heading: 'Manrope',
  body: 'DMSans',
} as const;

export const motion = {
  fast: 180,
  normal: 240,
  slow: 280,
} as const;

export const theme = { colors, spacing, radius, fonts, motion } as const;
export type Theme = typeof theme;
