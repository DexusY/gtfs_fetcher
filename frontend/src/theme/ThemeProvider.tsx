import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type Theme = 'light' | 'dark'
type Pref = Theme | 'system'

interface Ctx {
  theme: Theme
  preference: Pref
  setPreference: (p: Pref) => void
  toggle: () => void
}

const ThemeContext = createContext<Ctx | null>(null)

const STORAGE_KEY = 'gtfs-theme'

function resolve(pref: Pref): Theme {
  if (pref !== 'system') return pref
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readPreference(): Pref {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY) as Pref | null
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPref] = useState<Pref>(() => readPreference())
  const [theme, setTheme]     = useState<Theme>(() => resolve(readPreference()))

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [preference])

  const setPreference = useCallback((p: Pref) => {
    setPref(p)
    if (p === 'system') {
      localStorage.removeItem(STORAGE_KEY)
      setTheme(resolve('system'))
    } else {
      localStorage.setItem(STORAGE_KEY, p)
      setTheme(p)
    }
  }, [])

  const toggle = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setPreference])

  const value = useMemo(() => ({ theme, preference, setPreference, toggle }), [theme, preference, setPreference, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): Ctx {
  const v = useContext(ThemeContext)
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>')
  return v
}
