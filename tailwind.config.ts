import type { Config } from 'tailwindcss'

// Mirrors frontend/proxyma-app/tailwind.config.ts in the proxyma repo, reduced to what a
// marketing site needs. Every value resolves through a CSS variable defined in
// src/app/globals.css, so light/dark is one attribute on <html> rather than a second set of
// classes on every element.
//
// Prefer the SEMANTIC families (canvas/surface/ink/line/brand) over the raw proxima-*/mono-*
// steps: the semantic ones re-map per mode for free, the raw steps are mode-invariant and are
// only for brand fills that must not change (the logo mark, an accent glow).
export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['selector', ':root[data-mode="dark"]'],
  theme: {
    extend: {
      colors: {
        // - Semantic -
        canvas:        'rgb(var(--canvas) / <alpha-value>)',
        surface:       'rgb(var(--surface) / <alpha-value>)',
        'surface-alt': 'rgb(var(--surface-alt) / <alpha-value>)',
        line:          'rgb(var(--line) / <alpha-value>)',
        ink: {
          primary:   'rgb(var(--ink-primary) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          caption:   'rgb(var(--ink-caption) / <alpha-value>)',
          disabled:  'rgb(var(--ink-disabled) / <alpha-value>)',
        },
        brand: {
          solid:            'rgb(var(--brand-solid) / <alpha-value>)',
          accent:           'rgb(var(--brand-accent) / <alpha-value>)',
          pale:             'rgb(var(--brand-pale) / <alpha-value>)',
          'on-solid':       'rgb(var(--brand-on-solid) / <alpha-value>)',
          // The "legible" split exists because brand-coloured TEXT on the page's own
          // background needs a much lighter step than a brand FILL does.
          legible:          'rgb(var(--brand-legible) / <alpha-value>)',
          'accent-legible': 'rgb(var(--brand-accent-legible) / <alpha-value>)',
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        danger:  'rgb(var(--danger) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',

        // - Raw ramps, mode-invariant. Brand fills only. -
        proxima: {
          50:  'rgb(var(--p50)  / <alpha-value>)',
          100: 'rgb(var(--p100) / <alpha-value>)',
          200: 'rgb(var(--p200) / <alpha-value>)',
          300: 'rgb(var(--p300) / <alpha-value>)',
          400: 'rgb(var(--p400) / <alpha-value>)',
          500: 'rgb(var(--p500) / <alpha-value>)',
          600: 'rgb(var(--p600) / <alpha-value>)',
          700: 'rgb(var(--p700) / <alpha-value>)',
          800: 'rgb(var(--p800) / <alpha-value>)',
          900: 'rgb(var(--p900) / <alpha-value>)',
          950: 'rgb(var(--p950) / <alpha-value>)',
        },
        mono: {
          50:  'rgb(var(--n50)  / <alpha-value>)',
          100: 'rgb(var(--n100) / <alpha-value>)',
          200: 'rgb(var(--n200) / <alpha-value>)',
          300: 'rgb(var(--n300) / <alpha-value>)',
          400: 'rgb(var(--n400) / <alpha-value>)',
          500: 'rgb(var(--n500) / <alpha-value>)',
          600: 'rgb(var(--n600) / <alpha-value>)',
          700: 'rgb(var(--n700) / <alpha-value>)',
          800: 'rgb(var(--n800) / <alpha-value>)',
          900: 'rgb(var(--n900) / <alpha-value>)',
          950: 'rgb(var(--n950) / <alpha-value>)',
        },
      },

      // Indeterminate progress: conversion reports nothing, so the bar sweeps rather than
      // pretending to know how far along it is.
      keyframes: {
        sweep: {
          '0%':   { marginLeft: '-35%' },
          '100%': { marginLeft: '100%' },
        },
      },
      animation: {
        sweep: 'sweep 1.1s ease-in-out infinite',
      },

      fontFamily: {
        ui:       ['var(--font-grotesk)', 'system-ui', 'sans-serif'],
        // Alias kept so existing `font-grotesk` call sites resolve to the same stack.
        grotesk:  ['var(--font-grotesk)', 'system-ui', 'sans-serif'],
        // The wordmark ONLY - never body text.
        brand:    ['var(--font-orbitron)', 'sans-serif'],
        orbitron: ['var(--font-orbitron)', 'sans-serif'],
        mono:     ['Consolas', 'Space Mono', 'Cascadia Code', 'monospace'],
      },

      // Ten steps, each with the leading that keeps the smaller sizes readable rather than
      // merely smaller. Body default is 14/1.6.
      fontSize: {
        '2xs':  ['10px', { lineHeight: '15px' }],
        xs:     ['12px', { lineHeight: '18px' }],
        sm:     ['14px', { lineHeight: '22px' }],
        base:   ['16px', { lineHeight: '26px' }],
        lg:     ['18px', { lineHeight: '28px' }],
        xl:     ['21px', { lineHeight: '30px' }],
        '2xl':  ['25px', { lineHeight: '34px' }],
        '3xl':  ['29px', { lineHeight: '38px' }],
        '4xl':  ['37px', { lineHeight: '44px', letterSpacing: '-0.01em' }],
        '5xl':  ['49px', { lineHeight: '56px', letterSpacing: '-0.02em' }],
      },

      // Deliberately tight - crisp, not soft-bubbled. rounded-full is reserved for shapes
      // that are GENUINELY a circle or a pill (avatars, status dots, badges, icon buttons).
      borderRadius: {
        // The card radius as a token, so a panel cannot drift from --radius-card.
        card:  'var(--radius-card)',
        xs:    '2px',
        sm:    '4px',
        md:    '6px',   // buttons, inputs - the control radius
        lg:    '8px',   // cards, panels, dropdowns - the surface radius
        xl:    '10px',
        '2xl': '12px',
        '3xl': '14px',
        panel:   'var(--radius-card)',
        input:   'var(--radius-input)',
        control: 'var(--radius-control)',
      },

      boxShadow: {
        sm:        'var(--shadow-sm)',
        card:      'var(--shadow-card)',
        panel:     'var(--shadow-card)',
        'card-lg': 'var(--shadow-card-lg)',
        glow:      'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
} satisfies Config
