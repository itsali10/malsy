// Design tokens mirroring CSS custom properties in styles/theme.css.
// Use these in TypeScript/JavaScript logic; use var(--token) in CSS.

export const colors = {
  background:     '#F7F8FF',
  backgroundAlt:    '#EEF0FA',
  surface:          '#FFFFFF',
  border:           '#E6E8F2',

  primary:          '#AFA8FF',
  primarySoft:      '#DCD7FF',
  primaryStrong:    '#8F86F5',
  blue:             '#BEE7FF',
  pink:             '#FFD6E8',
  yellow:           '#FFE9A7',
  green:            '#C8F7DC',

  text:             '#252A3D',
  textSecondary:    '#6B7280',
  textMuted:        '#9CA3AF',

  error:            '#FFB3B3',
  errorText:        '#C45C5C',
  success:          '#B8F2D8',
  successText:      '#3D9B6E',

  // Legacy aliases
  violet:           '#8F86F5',
  violetLight:      '#AFA8FF',
  violetPale:       '#DCD7FF',
  mint:             '#3D9B6E',
  mintDark:         '#3D9B6E',
  coral:            '#C45C5C',
  amber:            '#D4A017',
  sky:              '#5BAFD4',
  skyDark:          '#3D8FB0',
  navy:             '#F7F8FF',
  navyMid:          '#FFFFFF',
  navySurface:      '#FFFFFF',
  white:            '#ffffff',
  offWhite:         '#EEF0FA',
  gray1:            '#E6E8F2',
  gray3:            '#6B7280',
  gray5:            '#9CA3AF',
} as const;

export const radii = {
  sm:    '12px',
  base:  '16px',
  lg:    '20px',
  xl:    '24px',
  '2xl': '28px',
  full:  '999px',
} as const;

export const spacing = {
  xs:  '4px',
  sm:  '8px',
  md:  '16px',
  lg:  '24px',
  xl:  '32px',
  '2xl': '48px',
} as const;

export const shadows = {
  sm:   '0 2px 8px rgba(37, 42, 61, 0.06)',
  md:   '0 4px 16px rgba(37, 42, 61, 0.08)',
  lg:   '0 8px 32px rgba(37, 42, 61, 0.10)',
  card: '0 4px 20px rgba(175, 168, 255, 0.12)',
} as const;

export type Color = keyof typeof colors;
