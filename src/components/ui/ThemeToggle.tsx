'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/providers/ThemeProvider'

// Type A (interactable) icon button per the style guide: a rounded-full container of at least
// 36px for WCAG 2.2 SC 2.5.8 even though the icon inside is 16px, plus a hover background and
// a focus ring.
export function ThemeToggle() {
  const { mode, toggle } = useTheme()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="w-9 h-9 -ml-2.5 rounded-full flex items-center justify-center text-ink-secondary hover:bg-ink-caption/10 hover:text-ink-primary transition-colors focus-ring"
    >
      {mode === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  )
}
