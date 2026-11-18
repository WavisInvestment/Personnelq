const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#f3f0e8',
          soft: '#e9e5da',
        },
        ink: {
          DEFAULT: '#1b211e',
          soft: '#434a45',
          muted: '#575d57',
        },
        line: {
          DEFAULT: '#dcd7c9',
          strong: '#c2bba8',
        },
        brand: {
          50: '#eef3ee',
          100: '#dbe7dd',
          200: '#b9d0bf',
          300: '#8fb39a',
          400: '#5f9272',
          500: '#3f7656',
          600: '#2e5f45',
          700: '#254d38',
          800: '#1e3d2d',
          900: '#172f23',
          950: '#0f2018',
        },
        accent: {
          100: '#fbe1d6',
          400: '#ec7a55',
          500: '#dd5a33',
          600: '#c24822',
        },
        trait: {
          openness: '#8b7cf6',
          conscientiousness: '#3b8fd9',
          extraversion: '#f5a623',
          agreeableness: '#ec5f87',
          neuroticism: '#2fb59a',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
        display: ['var(--font-display)', ...defaultTheme.fontFamily.sans],
        serif: ['var(--font-serif)', 'Georgia', ...defaultTheme.fontFamily.serif],
      },
      boxShadow: {
        card: 'none',
        lift: '0 2px 4px rgba(28, 27, 25, 0.05), 0 20px 40px -16px rgba(28, 27, 25, 0.22)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
