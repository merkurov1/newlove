/** @type {import('tailwindcss').Config} */
module.exports = {
  // ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ: Гарантируем, что Tailwind видит все файлы, 
  // включая стили в app (например, app/globals.css).
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    // Гарантируем, что Tailwind просканирует даже динамические пути
    "./app/**/*.{js,ts,jsx,tsx,mdx}", 
    // Явно добавляем главный CSS, чтобы Tailwind генерировал все необходимые утилиты
    "./app/globals.css", 
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb', // Твой кастомный цвет
      },
    },
  },
  darkMode: 'class',
  // САФЕЛИСТ: Оставляем, чтобы предотвратить удаление стилей Typography
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

