// /components/admin/editorUtils.js
// Общие утилиты для редакторов с унифицированной загрузкой изображений

/**
 * Универсальная функция загрузки изображений для всех редакторов
 * @param {File} file - Файл изображения
 * @param {string} componentName - Имя компонента для логирования (например, 'TiptapEditor')
 * @param {boolean} useSupabase - Использовать Supabase Storage (рекомендуется для Vercel)
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadImage(file, componentName = 'Editor', useSupabase = true) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🖼️ ${componentName}: Начинаю загрузку изображения:`, file.name);
    console.log(`📊 ${componentName}: Детали файла:`, {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      useSupabase
    });
  }
  
  // Используем новый унифицированный API endpoint
  const endpoint = '/api/media/upload';
  const formData = new FormData();
  formData.append('files', file);
  
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🚀 ${componentName}: Отправляю запрос на ${endpoint}`);
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      // NextAuth автоматически передает cookies с сессией
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📡 ${componentName}: Ответ сервера статус:`, res.status);
      console.log(`📋 ${componentName}: Заголовки ответа:`, Object.fromEntries(res.headers.entries()));
    }
    
    if (!res.ok) {
      const errorText = await res.text();
      if (process.env.NODE_ENV === 'development') {
        console.error(`❌ ${componentName}: Ошибка HTTP`, res.status, errorText);
      }
      
      // Попытаемся распарсить JSON из ошибки
      try {
        const errorData = JSON.parse(errorText);
        return { 
          success: false, 
          error: errorData.error || `HTTP ${res.status}` 
        };
      } catch {
        return { 
          success: false, 
          error: `HTTP ${res.status}: ${errorText}` 
        };
      }
    }

    const data = await res.json();
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ ${componentName}: Успешный ответ:`, data);
    }

    // Проверяем результат загрузки из нового API
    if (data.results && data.results.length > 0) {
      const uploadResult = data.results[0];
      if (uploadResult.success) {
        // Формируем публичный URL
        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${uploadResult.fileName}`;
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`🎯 ${componentName}: Изображение загружено:`, publicUrl);
        }
        
        return { success: true, url: publicUrl };
      } else {
        return { success: false, error: uploadResult.error || 'Ошибка загрузки' };
      }
    } else {
      return { success: false, error: 'Неверный формат ответа сервера' };
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`💥 ${componentName}: Исключение при загрузке:`, error);
    }
    return { 
      success: false, 
      error: `Network error: ${error.message}` 
    };
  }
}

/**
 * Конфигурация для Tiptap редактора
 */
export const tiptapConfig = {
  extensions: {
    // Настройки изображений
    image: {
      inline: false,
      allowBase64: false,
    },
    // Настройки редактора
    editorProps: {
      attributes: {
        class: 'prose prose-lg min-h-[300px] max-w-none focus:outline-none',
      },
    },
  },
};

/**
 * Конфигурация для Editor.js
 */
export const editorJsConfig = {
  tools: {
    // Настройки инструментов Editor.js
    image: {
      config: {
        // Настройки загрузки изображений
        endpoints: {
          byFile: '/api/upload/editor-image',
        },
        // Дополнительные настройки
        types: 'image/*',
        field: 'image',
      },
    },
  },
  // Общие настройки
  autofocus: true,
  placeholder: 'Начните писать или выберите инструмент...',
};

/**
 * Универсальная обработка ошибок для редакторов
 * @param {string} error - Текст ошибки
 * @param {string} componentName - Имя компонента
 * @param {boolean} showAlert - Показывать ли alert пользователю
 */
export function handleEditorError(error, componentName = 'Editor', showAlert = true) {
  console.error(`💥 ${componentName}: Ошибка:`, error);
  
  if (showAlert) {
    // Более дружелюбные сообщения для пользователя
    let userMessage = error;
    
    if (error.includes('401') || error.includes('Unauthorized')) {
      userMessage = 'Ошибка авторизации. Пожалуйста, войдите в систему.';
    } else if (error.includes('413') || error.includes('too large')) {
      userMessage = 'Файл слишком большой. Максимальный размер: 5MB.';
    } else if (error.includes('400') || error.includes('Invalid file type')) {
      userMessage = 'Неподдерживаемый тип файла. Используйте JPG, PNG, GIF или WebP.';
    } else if (error.includes('500')) {
      userMessage = 'Ошибка сервера. Попробуйте позже.';
    }
    
    alert(`Ошибка: ${userMessage}`);
  }
  
  return userMessage;
}

/**
 * Валидация файлов изображений
 * @param {File} file - Файл для проверки
 * @returns {{valid: boolean, error?: string}}
 */
export function validateImageFile(file) {
  if (!file) {
    return { valid: false, error: 'Файл не выбран' };
  }
  
  // Проверка типа файла
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: 'Неподдерживаемый тип файла. Используйте JPG, PNG, GIF или WebP.' 
    };
  }
  
  // Проверка размера файла (5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: 'Файл слишком большой. Максимальный размер: 5MB.' 
    };
  }
  
  return { valid: true };
}