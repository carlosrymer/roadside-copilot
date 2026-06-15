/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dependable blue — the trust/safety anchor for the auto-insurance audience.
        brand: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          light: '#eff6ff',
        },
      },
    },
  },
  plugins: [],
};
