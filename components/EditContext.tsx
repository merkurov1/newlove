'use client';

import { createContext, useContext, ReactNode } from 'react';

interface EditContextValue {
  contentType?: 'article' | 'project' | 'page';
  contentId?: string;
  slug?: string;
  title?: string;
  isEditable?: boolean;
}

const EditContext = createContext<EditContextValue>({});

interface EditProviderProps {
  children: ReactNode;
  value: EditContextValue;
}

/**
 * Контекстный провайдер для системы редактирования
 * 
 * Позволяет любому компоненту в дереве получить информацию
 * о редактируемом контенте без prop drilling
 */
export function EditProvider({ children, value }: EditProviderProps) {
  return (
    <EditContext.Provider value={value}>
      {children}
    </EditContext.Provider>
  );
}

/**
 * Хук для получения контекста редактирования
 */
export function useEditContext() {
  return useContext(EditContext);
}

export default EditContext;