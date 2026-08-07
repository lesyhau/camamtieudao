/**
 * A tiêu (vertical bamboo flute) with a note leaving it.
 *
 * Inline SVG rather than a file: it is one shape used in the header and as the favicon, and
 * `currentColor` lets it follow the theme without a second dark-mode asset.
 *
 * Placeholder until a real mark exists.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <g fill="rgb(var(--brand-on-solid))">
        {/* the flute, angled as it is held */}
        <rect x="14.6" y="5.5" width="2.6" height="18" rx="1.3" transform="rotate(12 16 14)" />
        {/* finger holes */}
        <circle cx="16.9" cy="12" r="0.85" opacity=".55" />
        <circle cx="17.6" cy="15.4" r="0.85" opacity=".55" />
        <circle cx="18.3" cy="18.8" r="0.85" opacity=".55" />
        {/* a note escaping the top */}
        <circle cx="9.6" cy="22.4" r="3.1" />
        <rect x="11.9" y="9.6" width="1.8" height="13" rx=".9" />
        <path d="M11.9 9.6c3.9.5 6.3 1.9 7.3 3.9-1.9-1.4-4.3-2-7.3-2.2z" />
      </g>
    </svg>
  );
}
