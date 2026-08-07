"use client";

import { useEffect, useState } from "react";
import { STORAGE_KEY, type Mode } from "./theme.ts";

/**
 * Reads the mode the pre-paint script already stamped, rather than deciding it again - so this
 * never causes a flash, it only keeps React's copy in sync and persists a change.
 *
 * 36px hit area for WCAG 2.2 SC 2.5.8 even though the glyph is 16px, as in Proxyma's own
 * toggle.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    setMode(document.documentElement.dataset.mode === "light" ? "light" : "dark");
  }, []);

  const toggle = () => {
    setMode((prev) => {
      const next: Mode = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.mode = next;
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch {
        // Private browsing or storage disabled - the toggle still works for this page view.
      }
      return next;
    });
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={mode === "dark" ? "Chuyển sang nền sáng" : "Chuyển sang nền tối"}
      title={mode === "dark" ? "Nền sáng" : "Nền tối"}
    >
      {mode === "dark" ? (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
