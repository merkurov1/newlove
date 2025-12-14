import React from 'react';

type Props = {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
};

export default function CenteredHeader({ eyebrow, title, subtitle, children }: Props) {
  return (
    <header className="mb-16 border-b border-gray-200 pb-8 text-center w-full">
      {children ? (
        <div className="mx-auto max-w-xl">{children}</div>
      ) : (
        <>
          {eyebrow && (
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400 block mb-6">
              {eyebrow}
            </span>
          )}
          {title && (
            <h1 className="text-5xl md:text-7xl font-serif font-medium leading-none tracking-tight mb-6 text-black">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-xl md:text-2xl text-gray-600 font-serif italic max-w-xl mx-auto">{subtitle}</p>
          )}
        </>
      )}
    </header>
  );
}
