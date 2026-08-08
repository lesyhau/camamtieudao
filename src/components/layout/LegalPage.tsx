import type { ReactNode } from 'react'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

/**
 * The shell both legal pages share: the site's own header and footer around a single narrow
 * column of prose.
 *
 * Narrower than the converter's column on purpose - `max-w-3xl` puts a line of body text at
 * roughly 80 characters, which is where continuous reading stops being work. The converter is
 * wide because it holds two panels side by side; a policy is one column of sentences.
 */
export function LegalPage({ title, updated, children }: {
  title: string
  /** Shown under the title. A policy with no date is a policy nobody can rely on. */
  updated: string
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar />
      <main className="flex-1 pt-14">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-16">
          <h1 className="text-base font-bold text-ink-primary mb-1">{title}</h1>
          <p className="text-xs text-ink-disabled mb-8">Cập nhật lần cuối: {updated}</p>
          <div className="docs-prose">{children}</div>
        </article>
      </main>
      <Footer />
    </div>
  )
}
