/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Theme tokens — resolve to CSS variables defined in index.css
        canvas:        'rgb(var(--c-canvas) / <alpha-value>)',
        surface:       'rgb(var(--c-surface) / <alpha-value>)',
        elevated:      'rgb(var(--c-elevated) / <alpha-value>)',
        hover:         'rgb(var(--c-hover) / <alpha-value>)',
        line:          'rgb(var(--c-line) / <alpha-value>)',
        lineStrong:    'rgb(var(--c-line-strong) / <alpha-value>)',
        fg:            'rgb(var(--c-fg) / <alpha-value>)',
        fgMuted:       'rgb(var(--c-fg-muted) / <alpha-value>)',
        fgSubtle:      'rgb(var(--c-fg-subtle) / <alpha-value>)',
        // Brand + status
        brand:         'rgb(var(--c-brand) / <alpha-value>)',
        brandHover:    'rgb(var(--c-brand-hover) / <alpha-value>)',
        brandSoft:     'rgb(var(--c-brand-soft) / <alpha-value>)',
        success:       'rgb(var(--c-success) / <alpha-value>)',
        successSoft:   'rgb(var(--c-success-soft) / <alpha-value>)',
        warning:       'rgb(var(--c-warning) / <alpha-value>)',
        warningSoft:   'rgb(var(--c-warning-soft) / <alpha-value>)',
        danger:        'rgb(var(--c-danger) / <alpha-value>)',
        dangerSoft:    'rgb(var(--c-danger-soft) / <alpha-value>)',
        info:          'rgb(var(--c-info) / <alpha-value>)',
        infoSoft:      'rgb(var(--c-info-soft) / <alpha-value>)',
        // AA-safe text shades for use on *Soft / brand-tint backgrounds
        brandText:     'rgb(var(--c-brand-text) / <alpha-value>)',
        successText:   'rgb(var(--c-success-text) / <alpha-value>)',
        warningText:   'rgb(var(--c-warning-text) / <alpha-value>)',
        dangerText:    'rgb(var(--c-danger-text) / <alpha-value>)',
        infoText:      'rgb(var(--c-info-text) / <alpha-value>)',
        // Layout-editor field categories (functional data palette)
        catStatic:     'rgb(var(--c-cat-static) / <alpha-value>)',
        catStaticSoft: 'rgb(var(--c-cat-static-soft) / <alpha-value>)',
        catLine:       'rgb(var(--c-cat-line) / <alpha-value>)',
        catLineSoft:   'rgb(var(--c-cat-line-soft) / <alpha-value>)',
        catDest:       'rgb(var(--c-cat-dest) / <alpha-value>)',
        catDestSoft:   'rgb(var(--c-cat-dest-soft) / <alpha-value>)',
        catTime:       'rgb(var(--c-cat-time) / <alpha-value>)',
        catTimeSoft:   'rgb(var(--c-cat-time-soft) / <alpha-value>)',
        snap:          'rgb(var(--c-snap) / <alpha-value>)',
      },
      zIndex: {
        // Semantic stacking scale — never reach for arbitrary 999
        dropdown: '40',
        sticky:   '30',
        overlay:  '50',
        modal:    '60',
        toast:    '70',
        tooltip:  '80',
      },
      fontFamily: {
        sans:  ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:  ['"Geist Mono"', 'ui-monospace', 'monospace'],
        display: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightish: '-0.012em',
        tight2:   '-0.02em',
        tight3:   '-0.035em',
        wide1:    '0.08em',
        widest1:  '0.14em',
      },
      borderRadius: {
        '4xl': '1.75rem',
      },
      boxShadow: {
        // Layered shadows for cards — subtle in light, glow-ish in dark
        card:       'var(--shadow-card)',
        cardHover:  'var(--shadow-card-hover)',
        pop:        'var(--shadow-pop)',
        ring:       '0 0 0 4px rgb(var(--c-brand) / 0.15)',
      },
      backgroundImage: {
        'grid-fade': 'var(--bg-grid)',
        'noise':     'var(--bg-noise)',
      },
      animation: {
        'fade-in':       'fadeIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up':      'slideUp 360ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'shimmer':       'shimmer 1.6s linear infinite',
        'pulse-soft':    'pulseSoft 2.2s ease-in-out infinite',
        'spin-slow':     'spin 5s linear infinite',
        'tick':          'tick 1.1s steps(1) infinite',
      },
      keyframes: {
        fadeIn:   { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp:  { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        shimmer:  { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pulseSoft:{ '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
        tick:     { '0%,49%': { opacity: 1 }, '50%,100%': { opacity: 0 } },
      },
    },
  },
  plugins: [],
}
