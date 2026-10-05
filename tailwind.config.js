/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/renderer/**/*.{js,jsx,ts,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1E293B",
          hover: "#0F172A",
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        secondary: "#64748B",
        accent: {
          DEFAULT: "#EF4444",
          hover: "#DC2626",
        },
        success: {
          DEFAULT: "#22C55E",
          hover: "#16A34A",
        },
        warning: {
          DEFAULT: "#F59E0B",
          hover: "#D97706",
        },
        background: "#F8FAFC",
        surface: "#FFFFFF",
        "on-surface": "#0F172A",
        outline: "#E2E8F0",
      },
      borderRadius: {
        'DEFAULT': '0.75rem',
        'lg': '1rem',
        'xl': '1.5rem',
        '2xl': '2rem',
        '3xl': '2.5rem',
      },
      fontFamily: {
        display: ["Cairo", "sans-serif"],
        body: ["Cairo", "sans-serif"],
      },
      boxShadow: {
        'premium': '0 10px 40px -10px rgba(0,0,0,0.05)',
        'premium-hover': '0 20px 50px -12px rgba(0,0,0,0.08)',
        'card': '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
      }
    }
  },
  plugins: [],
};
