"use client";

import { useState } from "react";
import { Logo } from "./Logo.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

/**
 * Proxyma's header, same shape and same tokens: fixed, glass over a single bottom rule, 56px
 * tall, and the row inside capped to the same column the page body uses - that is what makes
 * the logo sit directly above a section's first heading.
 *
 * Sign-in and administration are stubs; below 640px they collapse into a hamburger, which is
 * the layout they will need once they are real rather than one retrofitted later.
 */
export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header glass">
      <div className="bar">
        <a className="brand" href="/">
          <Logo size={28} />
          <span className="wordmark">CẢM ÂM</span>
        </a>

        <nav className="actions" aria-label="Chính">
          <button className="navlink" type="button" disabled title="Sắp có">Quản trị</button>
          <button className="navlink" type="button" disabled title="Sắp có">Đăng nhập</button>
          <ThemeToggle />
        </nav>

        {/* The theme toggle stays beside the hamburger on phones: the actions row is hidden
            there, and a preference control that vanishes on the smallest screen is the one
            people most want. */}
        <div className="mobile-actions">
          <ThemeToggle />
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
      </div>

      {open && (
        <div className="menu">
          <button className="navlink" type="button" disabled title="Sắp có">Quản trị</button>
          <button className="navlink" type="button" disabled title="Sắp có">Đăng nhập</button>
        </div>
      )}
    </header>
  );
}
