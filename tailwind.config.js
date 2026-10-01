/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        cyber: {
          950: '#070a12',
          900: '#0b101e',
          850: '#0f172a',
          800: '#141e38',
          700: '#1e2c4f',
          600: '#2b3f6e',
          500: '#3d599b',
          accent: '#38bdf8',
          gold: '#fbbf24',
          emerald: '#10b981',
          rose: '#f43f5e',
        }
      },
      keyframes: {
        fadeHighlight: {
          '0%': { backgroundColor: 'rgba(245, 158, 11, 0.95)', color: '#ffffff', transform: 'scale(1.08)' },
          '40%': { backgroundColor: 'rgba(245, 158, 11, 0.65)', color: '#ffffff' },
          '100%': { backgroundColor: 'transparent', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-pulse': 'fadeHighlight 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
      }
    },
  },
  plugins: [],
}
