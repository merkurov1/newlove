// Базовые стили для админ компонентов
// Этот файл содержит переиспользуемые классы для консистентности дизайна

export const styles = {
  // Кнопки
  button: {
    base: 'inline-flex items-center justify-center font-medium rounded-md border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed',
    sizes: {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm', 
      lg: 'px-6 py-3 text-base'
    },
    variants: {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white border-transparent',
      secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900 border-gray-300',
      danger: 'bg-red-600 hover:bg-red-700 text-white border-transparent',
      success: 'bg-green-600 hover:bg-green-700 text-white border-transparent'
    }
  },
  
  // Карточки
  card: {
    base: 'bg-white rounded-lg shadow-sm border border-gray-200',
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8'
    }
  },
  
  // Бэйджи
  badge: {
    base: 'inline-flex items-center font-medium rounded-full',
    sizes: {
      sm: 'px-2 py-1 text-xs',
      md: 'px-3 py-1 text-sm'
    },
    variants: {
      default: 'bg-gray-100 text-gray-800',
      success: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      danger: 'bg-red-100 text-red-800',
      info: 'bg-blue-100 text-blue-800'
    }
  },
  
  // Формы
  input: {
    base: 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm',
    error: 'border-red-300 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 focus:ring-green-500 focus:border-green-500'
  },
  
  // Статус цвета
  status: {
    published: 'bg-green-100 text-green-800',
    draft: 'bg-yellow-100 text-yellow-800',
    archived: 'bg-gray-100 text-gray-800',
    admin: 'bg-purple-100 text-purple-800',
    user: 'bg-blue-100 text-blue-800'
  }
};

// Утилитарные функции
export const utils = {
  formatDate: (date: string | Date) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },
  
  formatFileSize: (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  },
  
  truncateText: (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },
  
  getStatusIcon: (status: string) => {
    const icons: Record<string, string> = {
      published: '✅',
      draft: '📝',
      archived: '📦',
      admin: '👑',
      user: '👤',
      active: '🟢',
      inactive: '🔴'
    };
    return icons[status.toLowerCase()] || '⚪';
  }
};