"use client";

import { useState } from "react";
import { Logo } from "./Logo.tsx";

/**
 * Fixed bar, logo and title on the left, actions on the right - the same shape as Proxyma's.
 *
 * The actions are stubs on purpose: sign-in and administration are not built yet, and a menu
 * that renders nothing has nowhere to grow to. Below the tablet breakpoint they collapse into
 * a hamburger, which is the layout they will need once they are real.
 */
export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="bar">
        <a className="brand" href="/">
          <Logo size={28} />
          <span className="wordmark">Cảm Âm Tiêu Dao</span>
        </a>

        <nav className="actions" aria-label="Chính">
          <button className="ghost sm" type="button" disabled title="Sắp có">Đăng nhập</button>
        </nav>

        <button
          type="button"
          className="hamburger"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
            <path fill="currentColor" d={open
              ? "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"
              : "M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"} />
          </svg>
        </button>
      </div>

      {open && (
        <div className="menu">
          <button className="ghost" type="button" disabled title="Sắp có">Đăng nhập</button>
        </div>
      )}
    </header>
  );
}
