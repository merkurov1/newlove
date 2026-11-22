import React from 'react';

type Props = {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export default function CenteredHeader({
  eyebrow,
  title,
  subtitle,
  children,
  className = '',
}: Props) {
  return (
    <header className={`mb-16 border-b border-[#1D1B18]/12 pb-8 text-center w-full ${className}`}>
      {children ? (
        <div className="mx-auto max-w-xl">{children}</div>
      ) : (
        <>
          {eyebrow && (
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#847E73] block mb-6">
              {eyebrow}
            </span>
          )}
          {title && (
            <h1 className="text-5xl md:text-7xl font-serif font-medium leading-none tracking-tight mb-6 text-[#1D1B18]">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-xl md:text-2xl text-[#6F6A60] font-serif italic max-w-xl mx-auto">
              {subtitle}
            </p>
          )}
        </>
      )}
    </header>
  );
}
