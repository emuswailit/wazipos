/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  darkMode: "class", // 👈 ADD THIS LINE
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
}