'use client'

import { useState } from 'react'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

// 56px tall, glass over a single bottom rule, so the page's radial glow reads through it
// instead of the bar sitting on it as an opaque slab. Full-bleed fill, but the row inside is
// capped at the same max-w-5xl + px-6 column every page body uses - that is what makes the
// logo sit directly above a section's first heading.
//
// Proxyma's mark rotates slowly; this one does not. Their motion rule is that motion
// communicates state, and a rotating enso reads as a graphic that has come loose.
export function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-line">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <a
          href="/"
          className="flex items-center gap-2 no-underline hover:opacity-80 transition-opacity focus-ring rounded-sm"
        >
          <BrandIcon size={28} />
          <span className="font-brand font-bold text-brand-legible text-base tracking-[0.05em]">
            Cảm Âm
          </span>
        </a>

        <div className="flex items-center gap-6">
          <a
            href="/#huong-dan"
            className="hidden sm:inline text-sm font-semibold text-ink-caption hover:text-ink-primary transition-colors"
          >
            Hướng dẫn
          </a>
          {/* Sign-in and administration are not built yet. Disabled rather than absent, so the
              bar already has the shape it will keep. */}
          <button
            type="button"
            disabled
            title="Sắp có"
            className="hidden sm:inline text-sm font-semibold text-ink-disabled cursor-default"
          >
            Quản trị
          </button>
          <ThemeToggle />
          <button
            type="button"
            disabled
            title="Sắp có"
            className="hidden sm:inline-flex items-center rounded-md bg-brand-solid text-brand-on-solid px-4 py-2 text-sm font-semibold opacity-60 cursor-default"
          >
            Đăng nhập
          </button>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen(v => !v)}
            className="sm:hidden w-9 h-9 rounded-md border border-line flex items-center justify-center text-ink-caption focus-ring"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d={open
                  ? 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z'
                  : 'M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z'}
              />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="sm:hidden border-t border-line px-6 py-4 flex flex-col gap-3">
          <a href="/#huong-dan" className="text-sm font-semibold text-ink-caption">Hướng dẫn</a>
          <span className="text-sm font-semibold text-ink-disabled">Quản trị</span>
          <span className="text-sm font-semibold text-ink-disabled">Đăng nhập</span>
        </div>
      )}
    </nav>
  )
}
