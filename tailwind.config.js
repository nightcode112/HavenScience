/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f0ff',
          100: '#e5e5ff',
          200: '#d0d0ff',
          300: '#b3b3ff',
          400: '#9999ff',
          500: '#5854f4',
          600: '#4c46e8',
          700: '#3d35d9',
          800: '#2d25c7',
          900: '#1f18b5',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
      },
    },
  },
  plugins: [],
}