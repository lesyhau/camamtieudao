import { cn } from '@/utils/cn'

type Variant = 'brand' | 'featured' | 'electric' | 'success' | 'danger' | 'warning' | 'neutral'

const BASE =
  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap'

// Copied from proxyma-app/frontend/src/components/ui/Badge.tsx, default-tenant branch only.
// The three brand variants differ by WEIGHT, not by hue: solid fill, pale chip, tinted outline.
const VARIANT: Record<Variant, string> = {
  brand: 'bg-brand-solid text-brand-on-solid',
  featured: 'bg-brand-pale text-brand-legible border border-brand-solid/30',
  electric: 'bg-brand-solid/15 text-brand-legible border border-brand-solid/30',
  success: 'bg-green-600 text-white',
  warning: 'bg-amber-600 text-white',
  danger: 'bg-red-600 text-white',
  neutral: 'bg-surface-alt text-ink-secondary border border-line',
}

export function Badge({ label, variant = 'neutral', className }: {
  label: string
  variant?: Variant
  className?: string
}) {
  return <span className={cn(BASE, VARIANT[variant], className)}>{label}</span>
}

/**
 * A badge you can pick. Same shape and type as Badge, but a real <button> with a pressed state,
 * for the mapping and verse switches.
 *
 * Selected reads as `brand` (solid fill), unselected as `neutral` - the two ends of the same
 * scale, so the choice is legible at a glance rather than by hunting for a tick.
 */
export function BadgeToggle({ label, selected, onClick, title }: {
  label: string
  selected: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={cn(
        BASE,
        'transition-colors focus-ring cursor-pointer',
        selected ? VARIANT.brand : cn(VARIANT.neutral, 'hover:border-brand-solid hover:text-ink-primary'),
      )}
    >
      {label}
    </button>
  )
}
