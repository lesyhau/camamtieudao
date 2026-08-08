// A flat canvas fill plus ONE low-opacity radial glow in --brand-solid, anchored top-centre -
// the same background proxyma.ai paints. Static: the animated
// canvas star field was removed in the 2026-08-01 rebuild.
//
// Token-driven rather than a literal colour, so it renders correctly in light mode too instead
// of being a dark-only effect that has to be switched off. The previous version hardcoded
// rgba(6,182,212,...) - a colour from the retired "ocean" palette that no longer exists.
export function SiteBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none -z-20 bg-canvas"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 90% 55% at 50% 0%, rgb(var(--brand-solid) / 0.16) 0%, rgb(var(--brand-solid) / 0.06) 45%, transparent 100%)',
      }}
    />
  )
}
