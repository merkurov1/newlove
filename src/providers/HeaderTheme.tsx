// src/providers/HeaderTheme.tsx
'use client';

import React, { createContext, useContext, useState } from 'react';

// Создаем контекст
const HeaderThemeContext = createContext({});

// Компонент-провайдер
export const HeaderThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('dark'); // Пример состояния

  return (
    <HeaderThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </HeaderThemeContext.Provider>
  );
};

// Хук для использования контекста
export const useHeaderTheme = () => useContext(HeaderThemeContext);

export default HeaderThemeProvider;
