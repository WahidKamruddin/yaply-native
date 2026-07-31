// Provisional design tokens. No palette/component pass has happened yet —
// see "Design Direction" in CLAUDE.md. These values exist only so early
// screens have something to render; treat every color here as a placeholder.
export const theme = {
  colors: {
    background: '#0b0b12',
    surface: '#16161f',
    bubbleOwn: '#5b8def',
    bubbleOther: '#232332',
    text: '#f5f6fa',
    textMuted: '#9a9ab0',
    accent: '#7c5cff',
    danger: '#ef4444',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radii: {
    sm: 8,
    md: 16,
    lg: 24,
    bubble: 20,
  },
} as const
