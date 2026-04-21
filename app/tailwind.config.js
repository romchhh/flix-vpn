/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Futuristic accent palette
        neon: {
          cyan: '#22d3ee',
          blue: '#3b82f6',
          purple: '#a855f7',
        },
        glass: {
          card: 'rgba(255,255,255,0.04)',
          border: 'rgba(255,255,255,0.09)',
          hover: 'rgba(255,255,255,0.08)',
        },
      },
      boxShadow: {
        'glow-cyan': '0 0 24px rgba(34,211,238,0.25)',
        'glow-blue': '0 0 24px rgba(59,130,246,0.3)',
        'btn-primary': '0 8px 32px rgba(34,211,238,0.22)',
      },
    },
  },
  plugins: [],
}
