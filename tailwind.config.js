/** @type {import('tailwindcss').Config} */
module.exports = {
  // Обновляем пути для сканирования, включая новый main.css
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}", 
    "./app/main.css", // <--- ДОБАВЛЕН НОВЫЙ ФАЙЛ
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

