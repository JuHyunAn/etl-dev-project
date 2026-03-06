import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // dbt-inspired 테마
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        sidebar: {
          bg:     '#0f172a',
          hover:  '#1e293b',
          active: '#1e3a5f',
          text:   '#94a3b8',
          'text-active': '#f1f5f9',
        },
        canvas: {
          bg:     '#f8fafc',
          grid:   '#e2e8f0',
        },
        node: {
          input:     '#dbeafe',
          transform: '#fef9c3',
          output:    '#dcfce7',
          aetl:      '#fae8ff',
          log:       '#fee2e2',
        }
      },
      fontFamily: {
        sans: ['"Pretendard"', '"Noto Sans KR"', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      }
    },
  },
  plugins: [],
} satisfies Config
