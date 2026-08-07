import { cn } from '@/utils/cn'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'featured' | 'secondary' | 'hyperlink' | 'danger'
  size?: 'sm' | 'md'
}

// Copied from proxyma-app/frontend/src/components/ui/Button.tsx, keeping only the default-tenant
// branch - this site has one tenant, so the useIsDefaultTenant fork and the gradient branch it
// selects between have nothing to decide.
//
// This is the "Add Resource" button. That control is `<Button>` with no props at all, so `sm`
// is the shape to match: px-3 py-1.5 text-xs, rounded-md, font-bold font-grotesk, bg-brand-solid.
// `md` is the same button at the larger of its two sizes, which the component provides for a
// deliberate call-to-action - what the convert button is.
export function Button({ variant = 'primary', size = 'sm', className, children, ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-bold font-grotesk rounded-md',
        'transition-all duration-150 cursor-pointer whitespace-nowrap leading-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-solid focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        'active:scale-[0.98]',
        size === 'sm' ? 'px-3 py-1.5 text-xs gap-1.5' : 'px-5 py-2.5 text-sm gap-2',
        // Every non-hyperlink button gets the same floor width, so a button whose label changes
        // on click ("Dịch" -> "Đang đọc…") doesn't visibly resize itself or its neighbour.
        variant !== 'hyperlink' && 'min-w-[100px]',
        // `text-brand-on-solid` rather than `text-white` so the pairing stays correct if the
        // palette ever gives brand-solid a light value.
        variant === 'primary'   && 'bg-brand-solid text-brand-on-solid hover:opacity-90',
        variant === 'featured'  && 'bg-brand-pale text-brand-legible border border-brand-solid/30 hover:opacity-90',
        variant === 'secondary' && 'bg-transparent text-ink-primary border border-line hover:bg-surface hover:border-brand-solid',
        variant === 'hyperlink' && 'bg-transparent text-brand-legible border-none p-0 hover:opacity-80 hover:underline underline-offset-[3px]',
        // Not `bg-danger`: that token is brightened for dark mode precisely because it backs
        // error TEXT on the canvas, and white on it clears only 2.4:1 as a fill. red-600 is the
        // one step that holds 4.8:1 under white in both modes.
        variant === 'danger'    && 'bg-red-600 text-white hover:opacity-90',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
