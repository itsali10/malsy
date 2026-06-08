// Design tokens mirroring the CSS custom properties in globals.css.
// Use these in TypeScript/JavaScript logic; use var(--token) in CSS.

export const colors = {
  violet:       '#5B21F5',
  violetLight:  '#8B55FF',
  violetPale:   '#EDE8FF',
  mint:         '#00E5A0',
  mintDark:     '#00B87E',
  coral:        '#FF6B6B',
  amber:        '#FFB830',
  sky:          '#3BBFFF',
  skyDark:      '#0A8DCC',
  navy:         '#0D0B2E',
  navyMid:      '#1A1650',
  navySurface:  '#2B2765',
  white:        '#ffffff',
  offWhite:     '#F5F3FF',
  gray1:        '#EAE8F5',
  gray3:        '#9B98C0',
  gray5:        '#5B5880',
} as const;

export const radii = {
  base:  '16px',
  large: '24px',
} as const;

export type Color = keyof typeof colors;
