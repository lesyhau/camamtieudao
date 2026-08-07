'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Mode = 'light' | 'dark'

const STORAGE_KEY = 'camam-mode'

interface ThemeContextValue {
  mode: Mode
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({ mode: 'dark', toggle: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

// The site used to ship four hand-picked palettes (amber/nova/ocean/void) selected at build
// time by a constant in src/lib/themes.ts, with no light mode at all. That is replaced by the
// same model the product itself uses: one palette, and a personal light/dark preference on a
// `data-mode` attribute (see src/app/globals.css).
//
// The attribute is stamped before paint by MODE_INIT_SCRIPT in the root layout, so this
// provider never causes a flash - it only keeps React's copy of the value in sync and persists
// changes.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('dark')

  useEffect(() => {
    const current = document.documentElement.dataset.mode
    setMode(current === 'light' ? 'light' : 'dark')
  }, [])

  // Keep the tab icon on the same ink as the mark in the page. The <link media> queries in the
  // metadata follow the OS preference, which is right before any script runs - but they cannot
  // see this site's own toggle, so switching to light on a dark-themed OS would leave a pale
  // icon on the tab.
  //
  // This RE-AIMS each link's media query instead of rewriting hrefs or removing nodes: React
  // owns those elements and re-inserts them, and an earlier version that set href left a third
  // link still carrying `(prefers-color-scheme: light)` and winning on a light-themed OS.
  // Keying on the href each link already has is idempotent and survives however many React
  // decides to render.
  useEffect(() => {
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
      const wanted = link.getAttribute('href')?.includes(`icon-${mode}`)
      link.media = wanted ? 'all' : 'not all'
    }
  }, [mode])

  const toggle = useCallback(() => {
    setMode(prev => {
      const next: Mode = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.mode = next
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Private browsing / storage disabled - the toggle still works for this page view.
      }
      return next
    })
  }, [])

  return <ThemeContext.Provider value={{ mode, toggle }}>{children}</ThemeContext.Provider>
}

// Runs before first paint, inlined in <head>. Reads the saved preference, falling back to the
// OS setting, and stamps the attribute so the very first painted frame is already correct.
// Deliberately a hand-written, dependency-free string - it has to run before React exists.
export const MODE_INIT_SCRIPT = `
(function(){
  try {
    var saved = window.localStorage.getItem('${STORAGE_KEY}');
    var mode = saved === 'light' || saved === 'dark'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-mode', mode);
  } catch (e) {
    document.documentElement.setAttribute('data-mode', 'dark');
  }
})();
`
