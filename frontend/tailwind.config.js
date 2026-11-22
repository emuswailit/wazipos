/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  darkMode: "class", // 👈 ADD THIS LINE
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Keep in step with PALETTE in context/AuthContext.tsx.
      colors: {
        brand: { DEFAULT: '#2a6ff3', dark: '#1d4fd8', light: '#5b9dff', soft: 'rgba(42,111,243,0.12)' },
        sky: { brand: '#22b8f0' },
        navy: { DEFAULT: '#0b1733', light: '#13244d', deep: '#08122b' },
        canvas: '#f5f8ff',
      },
    },
  },
  plugins: [],
}