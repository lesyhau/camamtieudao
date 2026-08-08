"use client";

import { useEffect, useRef } from "react";

/**
 * One advertising position.
 *
 * Two states, and the empty one is deliberate rather than a placeholder to remove later: with
 * no AdSense ids configured the slot advertises ITSELF, so the space is already earning its
 * keep by telling a would-be advertiser where to write. That also means the layout is the same
 * before and after ads are switched on - nothing shifts on the day they start serving.
 *
 * The ids arrive as props from a server component rather than through NEXT_PUBLIC_*, because
 * NEXT_PUBLIC_ is baked in at BUILD time and this app's configuration lives in the host's .env.
 * Passing them down means switching ads on is an env change and a restart, not a rebuild.
 */
export interface AdSlotProps {
  /** AdSense publisher id, `ca-pub-...`. Empty renders the self-advertisement. */
  client?: string;
  /** AdSense slot id for this position. Empty renders the self-advertisement. */
  slot?: string;
  /** What the reserved box looks like, and what AdSense is asked for. */
  shape: "banner" | "panel";
  className?: string;
  /** Where an advertiser writes. */
  contact: string;
}

// Reserved heights. They are MINIMUMS, and they exist so the slot occupies its space from the
// first paint: an ad that arrives into a zero-height box shoves the page down under the reader,
// which is the single most annoying thing an ad can do.
const SHAPE = {
  // A leaderboard on a laptop, a large mobile banner on a phone - the two IAB sizes AdSense
  // fills most reliably at those widths.
  banner: "w-full min-h-[100px] lg:min-h-[90px]",
  // Fills the dead space beside a wide result panel. Roughly a 240x300 rectangle.
  panel: "w-full min-h-[250px]",
} as const;

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

export function AdSlot({ client, slot, shape, className = "", contact }: AdSlotProps) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!client || !slot || pushed.current) return;
    // Once per element. React 18+ runs effects twice in development, and a second push on the
    // same <ins> is what produces AdSense's "All 'ins' elements already have ads" error.
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // A blocked or failed script must not take the page with it.
    }
  }, [client, slot]);

  if (!client || !slot) {
    return (
      <aside
        aria-label="Khu vực quảng cáo"
        className={`${SHAPE[shape]} ${className} rounded-card border border-dashed border-line
          flex flex-col items-center justify-center gap-1 text-center px-4 py-6`}
      >
        <p className="text-xs label-upper text-ink-disabled">Khu vực quảng cáo</p>
        <p className="text-xs text-ink-caption">Bạn muốn đặt quảng cáo ở đây?</p>
        <a
          href={`mailto:${contact}?subject=${encodeURIComponent("Đặt quảng cáo trên Cảm âm Tiêu Dao")}`}
          className="text-xs text-brand-legible hover:opacity-80 hover:underline underline-offset-[3px] focus-ring rounded-sm"
        >
          {contact}
        </a>
      </aside>
    );
  }

  return (
    <aside aria-label="Quảng cáo" className={`${SHAPE[shape]} ${className}`}>
      {/* `data-full-width-responsive` off: on a phone AdSense will otherwise stretch a unit
          past the column and the page gains a horizontal scrollbar. */}
      <ins
        className="adsbygoogle block w-full"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="false"
      />
    </aside>
  );
}
