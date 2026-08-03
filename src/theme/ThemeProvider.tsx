import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colorTokens, spacing, radii, type, gradients, type ThemeMode } from './tokens'

// Same storage key name as web's `localStorage['yaply-theme']` — not
// functionally shared (different storage engines), but keeps the two
// platforms' persistence conventions conceptually aligned.
const STORAGE_KEY = 'yaply-theme'

interface ThemeContextValue {
  mode: ThemeMode
  colors: (typeof colorTokens)[ThemeMode]
  spacing: typeof spacing
  radii: typeof radii
  type: typeof type
  gradients: typeof gradients
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // System preference (RN's equivalent of web's `prefers-color-scheme`) is
  // the fallback until a persisted user choice loads; web's default is dark,
  // so an undetermined system scheme also defaults to dark here.
  const systemScheme = useColorScheme()
  const [mode, setMode] = useState<ThemeMode>(systemScheme === 'light' ? 'light' : 'dark')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light') setMode(stored)
      setHydrated(true)
    })
    // Only read the persisted choice once on mount — after that, `toggle`
    // is the sole writer, so this effect must not re-run on system changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = () => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark'
      void AsyncStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors: colorTokens[mode], spacing, radii, type, gradients, toggle }),
    [mode],
  )

  // Avoid a flash of the wrong theme before the persisted choice loads.
  if (!hydrated) return null

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useAppTheme must be used within a ThemeProvider')
  return ctx
}
