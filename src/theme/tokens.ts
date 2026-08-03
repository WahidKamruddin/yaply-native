// Color/type/shape tokens ported verbatim from web's src/styles.css (Tailwind
// v4 @theme block) — dark is web's default (`:root`), light is web's `.light`
// override. Every hex/rgba value here was extracted from that file, not
// invented, so yaply-native's palette matches yaply's actual brand instead of
// the custom Messenger-esque palette Phase 4 shipped.
export type ThemeMode = 'dark' | 'light'

export interface ColorTokens {
  background: string
  surface: string
  card: string
  border: string
  borderSoft: string
  tint: string
  tintStrong: string
  primary: string
  primaryDark: string
  primaryTint: string
  primaryTintStrong: string
  primaryText: string
  primaryForeground: string
  text: string
  textMuted: string
  textSubtle: string
  danger: string
  dangerTint: string
  online: string
  offline: string
  mint: string
  // Web's delete-confirm buttons use Tailwind's literal red-500/600, not the
  // `--danger` token — an inconsistency in web itself, reproduced faithfully
  // here rather than "fixed," per the design research.
  destructiveButton: string
  destructiveButtonPressed: string
}

const dark: ColorTokens = {
  background: '#070d1a',
  surface: '#0a1120',
  card: '#0d1526',
  border: 'rgba(143,184,255,0.14)',
  borderSoft: 'rgba(143,184,255,0.1)',
  tint: 'rgba(143,184,255,0.08)',
  tintStrong: 'rgba(143,184,255,0.16)',
  primary: '#5b8def',
  primaryDark: '#3b6fe0',
  primaryTint: 'rgba(91,141,239,0.12)',
  primaryTintStrong: 'rgba(91,141,239,0.16)',
  primaryText: '#8fb8ff',
  primaryForeground: '#ffffff',
  text: '#e9eefb',
  textMuted: '#8ba1c7',
  textSubtle: '#5c718f',
  danger: '#ff8080',
  dangerTint: 'rgba(255,99,99,0.12)',
  online: '#22c55e',
  offline: '#46587a',
  mint: '#6fe0b8',
  destructiveButton: '#ef4444',
  destructiveButtonPressed: '#dc2626',
}

const light: ColorTokens = {
  background: '#edf1fa',
  surface: '#ffffff',
  card: '#ffffff',
  border: '#dce7f8',
  borderSoft: '#f0f4fc',
  tint: '#f3f7ff',
  tintStrong: '#dce7f8',
  primary: '#5b8def',
  primaryDark: '#4a7de4',
  primaryTint: '#edf3ff',
  primaryTintStrong: '#e5edff',
  primaryText: '#5b8def',
  primaryForeground: '#ffffff',
  text: '#1a2744',
  textMuted: '#6b84ab',
  textSubtle: '#9ab0cc',
  danger: '#ef4444',
  dangerTint: '#fef2f2',
  online: '#22c55e',
  offline: '#b0c0d8',
  mint: '#0b9e74',
  destructiveButton: '#ef4444',
  destructiveButtonPressed: '#dc2626',
}

export const colorTokens: Record<ThemeMode, ColorTokens> = { dark, light }

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const

export const radii = {
  sm: 8,
  md: 16,
  lg: 24,
  // Message bubble corners: 16px on three corners, ~3px on the sender-side
  // "tail" corner (bottom-right for own, bottom-left for other) — matches
  // web's `rounded-2xl` + squashed `rounded-br-sm`/`rounded-bl-sm`.
  bubble: 16,
  bubbleTail: 3,
  pill: 999,
} as const

// Display sizes use Bricolage Grotesque (loaded via expo-font); body/label/
// caption stay on the system font (no fontFamily override needed).
export const type = {
  title: { fontSize: 28, fontWeight: '800' as const, fontFamily: 'BricolageGrotesque' },
  heading: { fontSize: 20, fontWeight: '700' as const, fontFamily: 'BricolageGrotesque' },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
} as const

export const gradients = {
  // Own-message bubbles, send button, primary CTA — matches web's
  // `bg-gradient-to-br from-primary to-primary-dark`.
  primary: (mode: ThemeMode) => [colorTokens[mode].primary, colorTokens[mode].primaryDark] as const,
}
