import type { Config } from 'tailwindcss'

/**
 * Design tokens from design-system.md — the single source of truth.
 * Surfaces are CSS variables so themes (dark/oled/light) can swap them;
 * hex fallbacks match the sampled dark theme.
 */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="light"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          window: 'var(--surface-window)',
          base: 'var(--surface-base)',
          raised: 'var(--surface-raised)',
          inset: 'var(--surface-inset)',
          input: 'var(--surface-input)',
          hover: 'var(--surface-hover)',
          active: 'var(--surface-active)'
        },
        accent: {
          DEFAULT: '#1bd96a',
          hover: '#12b859',
          contrast: '#03150a',
          tint: 'rgba(27,217,106,0.10)'
        },
        danger: {
          DEFAULT: '#ff496e',
          tint: 'rgba(255,73,110,0.12)'
        },
        warn: '#ffa347',
        info: '#5b9dff',
        special: '#c084fc',
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)'
        },
        chip: {
          bg: 'var(--chip-bg)',
          text: 'var(--chip-text)'
        },
        line: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)'
        },
        log: '#47d178'
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      fontSize: {
        display: ['32px', { lineHeight: '38px', fontWeight: '800' }],
        h1: ['24px', { lineHeight: '30px', fontWeight: '800' }],
        h2: ['20px', { lineHeight: '26px', fontWeight: '700' }],
        h3: ['16px', { lineHeight: '22px', fontWeight: '700' }],
        body: ['14px', { lineHeight: '20px' }],
        small: ['13px', { lineHeight: '18px' }],
        tiny: ['12px', { lineHeight: '16px' }]
      },
      borderRadius: {
        card: '16px',
        md2: '12px',
        sm2: '8px'
      },
      boxShadow: {
        modal: '0 24px 64px rgba(0,0,0,0.5)',
        popover: '0 8px 24px rgba(0,0,0,0.4)'
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)'
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        page: '220ms'
      }
    }
  },
  plugins: []
} satisfies Config
