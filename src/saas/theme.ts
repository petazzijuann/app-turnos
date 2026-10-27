/** SAAS · Modo claro / oscuro. */
import { useCallback, useEffect, useState } from 'react'
import { key } from './storage'

export type Theme = 'light' | 'dark'

function current(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(key('theme'), theme)
    } catch {
      /* sin acceso a localStorage */
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#080c14' : '#f6f8fb')
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, setTheme, toggle }
}
