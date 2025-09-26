/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
      },
    },
  },
  darkMode: 'class',
  safelist: [
    {
      pattern: /prose-?(.+)?/,
      variants: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
    'prose',
    'prose-lg',
  ],
  plugins: [require('@tailwindcss/typography')],
};