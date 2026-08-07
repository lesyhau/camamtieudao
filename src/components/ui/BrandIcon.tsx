import { forwardRef } from 'react'

interface BrandIconProps {
  size?: number
  className?: string
}

/**
 * The mark: an ensō with a robed figure standing inside it.
 *
 * HAND-DRAWN APPROXIMATION of the supplied logo, not a trace of it. The ring is built as a
 * filled band between two circles whose centres are OFFSET, which is what gives it varying
 * thickness - a stroked circle is uniform and reads as a printed ring rather than a brush
 * stroke. What it cannot reproduce is the dry-brush texture: the speckled, broken edge where
 * the bristles ran out of ink. That needs a trace of the original artwork.
 *
 * Deliberately NOT built from the brand ramp. Proxyma's mark is a palette object, so its fills
 * resolve through --p400..--p700; an ensō is ink, and tinting it teal would be a different
 * logo. It uses currentColor so the header and footer can set it per mode.
 */
export const BrandIcon = forwardRef<SVGSVGElement, BrandIconProps>(
  function BrandIcon({ size = 64, className }, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        width={size}
        height={size}
        shapeRendering="geometricPrecision"
        className={className}
        aria-hidden="true"
      >
        <g fill="currentColor">
          {/* the ensō, open at the upper right */}
          <path d="M 437.5 142.6 A 214 214 0 1 1 300.5 46.7 L 306.6 73.8 A 176 176 0 1 0 419.3 152.7 Z" />
          {/* the tapering entry stroke, so the brush appears to start rather than stop dead */}
          <path d="M 437.5 142.6 L 419.3 152.7 L 452 196 Z" opacity=".85" />

          {/* the figure: head, then a robe that widens to the hem */}
          <ellipse cx="256" cy="150" rx="26" ry="30" />
          <path d="M256 176c26 0 40 22 44 58 4 34 6 74 8 104 1 14-6 20-22 21h-60c-16-1-23-7-22-21 2-30 4-70 8-104 4-36 18-58 44-58Z" />
        </g>
      </svg>
    )
  }
)
