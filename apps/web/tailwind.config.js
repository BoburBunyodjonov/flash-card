/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Premium dark palette
        bg: '#08080C',
        'bg-elevated': '#0E0E15',
        card: '#15151E',
        'card-2': '#1B1B26',
        surface: '#20202C',
        border: 'rgba(255,255,255,0.07)',
        'border-strong': 'rgba(255,255,255,0.12)',
        primary: '#6366F1',
        'primary-light': '#818CF8',
        accent: '#8B5CF6',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        text: 'rgba(255,255,255,0.95)',
        muted: 'rgba(255,255,255,0.55)',
        faint: 'rgba(255,255,255,0.32)',
      },
      borderRadius: {
        card: '20px',
        btn: '16px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
