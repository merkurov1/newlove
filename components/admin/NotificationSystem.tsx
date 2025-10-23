"use client";
import { createContext, useContext, useState, useEffect } from 'react';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    const newNotification = { ...notification, id };
    setNotifications(prev => [...prev, newNotification]);

    // Auto remove after duration
    const duration = notification.duration || 5000;
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}

function NotificationItem({ 
  notification, 
  onClose 
}: { 
  notification: Notification; 
  onClose: () => void 
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const typeStyles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  return (
    <div 
      className={`
        max-w-sm w-full border rounded-lg shadow-lg p-4 transition-all duration-300 transform
        ${typeStyles[notification.type]}
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <span className="text-lg">{icons[notification.type]}</span>
        </div>
        <div className="ml-3 flex-1">
          <h4 className="font-medium">{notification.title}</h4>
          {notification.message && (
            <p className="mt-1 text-sm opacity-90">{notification.message}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <span className="sr-only">Закрыть</span>
          ✕
        </button>
      </div>
    </div>
  );
}