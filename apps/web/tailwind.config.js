/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--ws-bg)',
        'bg-elevated': 'var(--ws-bg-elevated)',
        card: 'var(--ws-card)',
        'card-2': 'var(--ws-card-2)',
        surface: 'var(--ws-surface)',
        border: 'var(--ws-border)',
        'border-strong': 'var(--ws-border-strong)',
        primary: 'var(--ws-primary)',
        'primary-light': 'var(--ws-primary-light)',
        accent: 'var(--ws-accent)',
        success: 'var(--ws-success)',
        warning: 'var(--ws-warning)',
        danger: 'var(--ws-danger)',
        text: 'var(--ws-text)',
        muted: 'var(--ws-muted)',
        faint: 'var(--ws-faint)',
      },
      borderRadius: {
        card: '22px',
        btn: '14px',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        primary: 'var(--ws-shadow-primary)',
      },
    },
  },
  plugins: [],
}
