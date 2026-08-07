import { BrandLockup } from '@/components/ui/BrandLogo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

// 56px tall, glass over a single bottom rule, so the page's radial glow reads through it
// instead of the bar sitting on it as an opaque slab. Full-bleed fill, but the row inside is
// capped at the same max-w-5xl + px-6 column every page body uses - that is what makes the
// logo sit directly above a section's first heading.
//
// Hướng dẫn / Quản trị / Đăng nhập are not built yet and are not rendered. Showing them
// disabled advertised three dead ends; the sign-in button returns as <Button> when there is an
// account to sign into.
//
// No client state left here, so no 'use client': the only interactive part is ThemeToggle,
// which is its own client component.
export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-line">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLockup size={28} />
          {/* The tagline you were considering for the header. It reads as a strapline beside
              the wordmark rather than a second heading, so it takes the caption weight and a
              divider. Hidden below `md` - on a phone it would either wrap the bar to two lines
              or squeeze the wordmark. Delete this span if you decide against it. */}
          <span className="hidden md:flex items-center gap-3 text-sm text-ink-caption truncate">
            <span aria-hidden="true" className="w-px h-4 bg-line" />
            Cảm âm nhạc Hoa chất lượng cao
          </span>
        </div>
        <ThemeToggle />
      </div>
    </nav>
  )
}
