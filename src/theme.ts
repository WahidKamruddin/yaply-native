// Design pass (Phase 4): warm coral-to-amber accent on a near-black
// charcoal-violet background — deliberately distinct from web's cold
// blue-slate palette (#1a2744/#5b8def) and from the generic "AI blue-purple
// gradient" look, per the Design Direction section in CLAUDE.md. Own-message
// bubbles use `gradient` via expo-linear-gradient; everything else is flat.
//
// Typography is system font (no custom font file loaded yet — a deliberate
// simplification, not an oversight: adding one needs an asset + expo-font
// wiring, which isn't worth the setup cost before there's a real screen to
// judge it against). Weight/size scale stands in for a type system.
export const theme = {
  colors: {
    background: '#0d0d14',
    surface: '#18181f',
    surfaceRaised: '#212129',
    border: '#2a2a35',
    bubbleOwn: '#ff6a5c',
    bubbleOther: '#23232d',
    text: '#f7f4ef',
    textMuted: '#8e8ea0',
    accent: '#ff6a5c',
    accentSoft: '#ffab52',
    danger: '#ef4444',
  },
  gradient: {
    // Own-message bubble fill — coral to amber.
    bubbleOwn: ['#ff6a5c', '#ffab52'] as const,
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
    pill: 999,
  },
  type: {
    title: { fontSize: 28, fontWeight: '800' as const },
    heading: { fontSize: 20, fontWeight: '700' as const },
    body: { fontSize: 15, fontWeight: '400' as const },
    label: { fontSize: 13, fontWeight: '600' as const },
    caption: { fontSize: 12, fontWeight: '400' as const },
  },
} as const

// Deterministic per-conversation accent color — groundwork for
// Messenger-style "pick a chat color" theming. No settings UI to override it
// yet; every avatar/accent for a given conversation id always resolves to
// the same color in this palette, which is what makes conversations visually
// distinguishable in the list without per-conversation state.
const CONVERSATION_PALETTE = [
  '#ff6a5c', // coral (matches the default accent)
  '#ffab52', // amber
  '#5b8def', // blue
  '#7c5cff', // violet
  '#2dd4bf', // teal
  '#f472b6', // pink
  '#facc15', // gold
  '#34d399', // green
] as const

export function colorForConversation(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % CONVERSATION_PALETTE.length
  return CONVERSATION_PALETTE[index]
}
