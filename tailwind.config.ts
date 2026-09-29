import type { Config } from 'tailwindcss';

/**
 * Colour tokens are driven by CSS variables (RGB triples) declared in `app/globals.css`.
 * That is what makes dark mode work everywhere at once: `text-charcoal`, `border-charcoal/10`,
 * `bg-cream`, `bg-blush-100` … all resolve through the variables, so flipping the `.dark` class
 * re-themes the entire app without touching a single component.
 */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        // ── Brand palette ────────────────────────────────────────────────────
        // Hues come from two sources: the Alikati Beauty Home logo (rose + gold crown) and the
        // owner's chosen storefront reference (hot pink #ED4080 / magenta #C21F63 on near-white,
        // soft pink tiles, green prices, red sale badges).
        //
        // `rose.gold` keeps its v1 token name so every existing utility stays valid; only its
        // value changed. Surfaces and tints resolve through CSS variables, so both themes follow.
        blush: {
          DEFAULT: v('blush'),
          50: v('blush-50'),
          100: v('blush-100'),
          200: v('blush-200'),
          300: v('blush-300'),
          400: v('blush-400'),
        },
        rose: {
          gold: '#E23D7C',
          50: v('rose-50'),
          100: v('rose-100'),
          200: v('rose-200'),
          300: v('rose-300'),
          400: '#F76BA4',
          500: '#ED4080',
          // 600 doubles as the hover state for `bg-rose-gold`, so it must be clearly deeper.
          600: '#C21F63',
          700: '#A5184F',
          800: '#8F0E52',
        },
        // Discount badges and prices, matching the reference storefront.
        sale: {
          DEFAULT: '#E53935',
          light: '#FF6B68',
        },
        price: {
          DEFAULT: '#12874A',
          light: '#1BA05C',
        },
        gold: {
          DEFAULT: '#C28A4C',
          100: v('gold-100'),
          200: '#F1C48E',
          300: '#DAA462',
          500: '#C28A4C',
          700: '#A36834',
        },
        charcoal: {
          DEFAULT: v('charcoal'),
          light: v('charcoal-light'),
          soft: v('charcoal-soft'),
        },
        cream: {
          DEFAULT: v('cream'),
          100: v('cream-100'),
          200: v('cream-200'),
        },
        // Card/panel surface. Prefer this over `bg-white` in new code.
        surface: v('surface'),
        success: '#1F9D55',
        warn: '#D97706',
        danger: '#C0392B',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(46, 42, 43, 0.04), 0 8px 24px -12px rgba(46, 42, 43, 0.18)',
        lift: '0 2px 4px rgba(46, 42, 43, 0.05), 0 18px 40px -18px rgba(46, 42, 43, 0.28)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        // Gentle zoom on the visible hero slide. Deliberately subtle (7% over 9s) — it reads as
        // life rather than motion, and is skipped entirely when the visitor prefers reduced motion.
        'hero-pan': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.07)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
        'hero-pan': 'hero-pan 9s ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
