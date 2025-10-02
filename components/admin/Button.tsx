import Link from 'next/link';
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  loading = false, 
  children, 
  className = '',
  disabled,
  ...props 
}: ButtonProps) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white border-transparent',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900 border-gray-300',
    danger: 'bg-red-600 hover:bg-red-700 text-white border-transparent',
    success: 'bg-green-600 hover:bg-green-700 text-white border-transparent'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      className={`
        inline-flex items-center justify-center font-medium rounded-md border
        transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
          Загрузка...
        </>
      ) : (
        children
      )}
    </button>
  );
}

interface LinkButtonProps {
  href: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

export function LinkButton({ 
  href, 
  variant = 'primary', 
  size = 'md', 
  children, 
  className = '' 
}: LinkButtonProps) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white border-transparent',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900 border-gray-300',
    danger: 'bg-red-600 hover:bg-red-700 text-white border-transparent',
    success: 'bg-green-600 hover:bg-green-700 text-white border-transparent'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <Link
      href={href}
      className={`
        inline-flex items-center justify-center font-medium rounded-md border
        transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
    >
      {children}
    </Link>
  );
}

interface BackButtonProps {
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function BackButton({ href, onClick, className = '' }: BackButtonProps) {
  if (href) {
    return (
      <LinkButton
        href={href}
        variant="secondary"
        size="sm"
        className={`mb-4 ${className}`}
      >
        ← Назад
      </LinkButton>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick || (() => window.history.back())}
      className={`mb-4 ${className}`}
    >
      ← Назад
    </Button>
  );
}