import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          50: '#f4f7ff',
          100: '#e6edff',
          500: '#5b6ee1',
          600: '#4357c8',
          700: '#3344a3',
          900: '#192152',
        },
        neutral: {
          50: '#faf9f6',
          100: '#f2f0ea',
          200: '#e5e1d8',
          300: '#d5cfc2',
          400: '#918a7b',
          700: '#464236',
          800: '#2f2d26',
          900: '#181713',
        },
        atlas: {
          50: '#effcf9',
          100: '#ccf4eb',
          500: '#20b49c',
          600: '#168c7b',
          700: '#126f63',
        },
        sunrise: {
          50: '#fff8ed',
          100: '#ffefd1',
          500: '#e99d2d',
          600: '#c77d18',
        },
        success: { 500: '#22c55e' },
        error: { 500: '#ef4444' },
        warning: { 500: '#f59e0b' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Cal Sans"', 'Inter', 'sans-serif'],
      },
      fontSize: {
        body: ['1rem', { lineHeight: '1.5' }],
        heading: ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
        display: ['2.25rem', { lineHeight: '1.2', fontWeight: '700' }],
      },
      spacing: {
        'card-pad': '1rem',
      },
      borderRadius: {
        card: '1rem',
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
      boxShadow: {
        card: '0 18px 45px rgba(24,23,19,0.07), 0 1px 0 rgba(255,255,255,0.8) inset',
        'card-hover': '0 24px 60px rgba(24,23,19,0.11), 0 1px 0 rgba(255,255,255,0.85) inset',
        elevated: '0 30px 80px rgba(24,23,19,0.16), 0 1px 0 rgba(255,255,255,0.82) inset',
        glow: '0 24px 70px rgba(91,110,225,0.18)',
      },
      backgroundImage: {
        'atlas-grid':
          'linear-gradient(rgba(70,66,54,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(70,66,54,0.06) 1px, transparent 1px)',
        'route-wash':
          'radial-gradient(circle at 18% 12%, rgba(32,180,156,0.16), transparent 28%), radial-gradient(circle at 88% 18%, rgba(233,157,45,0.14), transparent 24%), linear-gradient(135deg, #fffdf8 0%, #f4f7ff 52%, #effcf9 100%)',
      },
      transitionDuration: {
        ui: '200ms',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
}

export default config
