/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./views/**/*.ejs",
    "./public/**/*.{js,html}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      boxShadow: {
        soft: "0 6px 18px rgba(0,0,0,0.28)",
        deep: "0 10px 30px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
}
