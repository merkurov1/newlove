export default function GlobeAvatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  const s = size;
  return (
    <div className={`rounded-full bg-blue-50 text-blue-700 flex items-center justify-center overflow-hidden ${className}`} style={{ width: s, height: s }}>
      <svg width={s*0.7} height={s*0.7} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2z" fill="#D1E8FF"/>
        <path d="M4 12h16M12 4c1.657 2 3 5 3 8s-1.343 6-3 8c-1.657-2-3-5-3-8s1.343-6 3-8z" stroke="#2563EB" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
