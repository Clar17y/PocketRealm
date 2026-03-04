import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        almendra: ['var(--font-almendra)', 'Georgia', 'serif'],
        crimson: ['var(--font-crimson)', 'Georgia', 'serif'],
        pixel: ['var(--font-pixel)', 'monospace'],
      },
      keyframes: {
        'error-flash': {
          '0%, 100%': { opacity: '1' },
          '25%': { opacity: '0.4' },
          '50%': { opacity: '1' },
          '75%': { opacity: '0.4' },
        },
      },
      animation: {
        'error-flash': 'error-flash 1s ease-in-out',
      },
    },
  },
  plugins: [],
};

export default config;
