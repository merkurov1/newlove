/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}", // Все файлы в app
    "./components/**/*.{js,ts,jsx,tsx,mdx}", // Компоненты
    "./pages/**/*.{js,ts,jsx,tsx,mdx}", // Для совместимости, если есть pages
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb', // Твой кастомный цвет
      },
    },
  },
  darkMode: 'class',
  safelist: [
    // Добавь сюда классы, которые генерируются динамически, если есть
    // Например: { pattern: /bg-(red|blue|green)-(100|200|300|400|500|600|700|800|900)/ }
  ],
  plugins: [require('@tailwindcss/typography')],
};