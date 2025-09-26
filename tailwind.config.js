/** @type {import('tailwindcss').Config} */
module.exports = {
  // Используем чистые пути App Router
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb', // Твой кастомный цвет
      },
    },
  },
  darkMode: 'class',
  // САФЕЛИСТ: Оставляем, чтобы гарантировать генерацию стилей Typography
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

