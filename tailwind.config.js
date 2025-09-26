/** @type {import('tailwindcss').Config} */
module.exports = {
  // Используем явные пути
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}", 
    // Явно добавляем главный CSS
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

