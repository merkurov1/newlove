import React from 'react';

type IconProps = { size?: number; className?: string } & React.SVGProps<SVGSVGElement>;

export function XIcon({ size = 20, className = '', ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...rest} xmlns="http://www.w3.org/2000/svg">
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InfoIcon({ size = 18, className = '', ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...rest} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" />
      <path d="M11.25 11h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 7v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SparklesIcon({ size = 18, className = '', ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...rest} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3l1.5 3 3 1.5-3 1.5L12 12l-1.5-3L7 7.5 10 6 12 3z" stroke="currentColor" strokeWidth="0.8" fill="currentColor" />
      <path d="M4 13l.8 1.6L6.4 16 4.8 17.4 4 19l-.8-1.6L1.6 16 3.2 14.6 4 13z" stroke="currentColor" strokeWidth="0.6" fill="currentColor" />
    </svg>
  );
}

export default {
  XIcon,
  InfoIcon,
  SparklesIcon,
};
